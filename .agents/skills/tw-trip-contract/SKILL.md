---
name: tw-trip-contract
description: 台灣國內與離島旅遊規劃網頁專案的團隊共用合約與邊界規範。凡是在本專案進行 schema、services、data、engine、gateway 或 src 開發、寫測試、串接 TDX／氣象署／主機模型或準備 PR 時，必須先讀取並遵守本技能。
---

# 台灣國內與離島旅遊規劃網頁 — 共用合約與協作守則

開工前請同步遵守專案根目錄的介面美學、觸控相容與在地文案規範，並嚴格落實以下 6 項全隊共識。

## 1. 目錄隔離與角色邊界

每位成員與其 AI 僅能改動自己主場資料夾，禁止越界修改其他模組或偷改共用介面：

| 角色 | 專屬允許修改目錄 | 禁止修改 |
| :--- | :--- | :--- |
| **架構師** | `schema/`、`.github/`、`gateway/`、根目錄設定檔 | 未協調前不隨意覆蓋成員功能分支 |
| **路線情報員** | `services/`、`data/` | `schema/`、`engine/`、`src/` |
| **優惠精算師** | `engine/`（及個人認領的 `data/curated/` 區段） | `schema/`、`services/`、`src/` |
| **介面設計師** | `src/`（及個人認領的 `data/curated/` 區段） | `schema/`、`services/`、`engine/` |

- **分支命名決定 CI 邊界檢查**：介面設計師用 `feat/ui-<主題>`、優惠精算師用 `feat/fare-engine-<主題>`、路線情報員用 `feat/route-intel-<主題>`。PR 改到表格以外的目錄，CI 會直接失敗。
- 若開發過程發現 `schema/trip.ts` 缺少欄位，必須**立即停止改動共用檔**，輸出 `SCHEMA_CHANGE_REQUEST`（含欄位名稱、型別與用途說明）供架構師與全隊對齊後統一更新。
- **依賴鎖定紀律**：根目錄 `package.json` 與 `package-lock.json` 已預裝 `leaflet`、`react-leaflet`、`@types/leaflet`、`zod`、`lucide-react`、`vite-plugin-pwa`，以及元件測試用的 `jsdom`、`@testing-library/react`、`@testing-library/dom`（測試檔開頭加 `// @vitest-environment jsdom`）。非架構師分支禁止執行會改動根目錄依賴檔的 `npm install <新套件>`；若確有新套件需求，請先告知架構師統一安裝。

## 2. 雙向型別合約（`schema/trip.ts`）

- 嚴禁自創未定義欄位或任意更動既有鍵名。
- **輸入合約（`TripInput`）**：必須完整涵蓋 `origin`（出發地）、`destination`、`startDate`、`days`、`budgetPerPersonTwd`、`lodgingTier`、`roomCount`、`group`（混搭身分計數）、`passes`、`preferredTransport`、`pace`。
- **輸出合約（`TripPlanResult`）**：必須包含 `days`（含 `seaRisk`、`legs`、`stops`、`googleMapsRouteUrl`）、`budget`（含 `weekdayShiftSavingHint`、各身分別 `perIdentitySplit` 與 `roundingRemainderTwd`）、`reviewWarnings`、`aiSummary?` 與 `modeUsed`。
- **型別一律從 `schema/trip.ts` 匯入**（由 Zod `z.infer` 推導），不要自己重寫一份；引擎產出交付前用 `TripPlanResultSchema.parse()` 驗一次。以下規則 Zod 會直接擋下：
  - **身分是人頭數**：`group` 每個欄位都是人數。`disabled`（身障本人）與 `disabledCompanion`（必要陪伴者）分開計算，陪伴者不能多於身障旅客；`offshoreResidentCount` 是設籍離島的人數（只有這幾位適用居民票價），不能多於同行總人數；至少要有 1 位成人、大專生、65 歲以上長輩或身障旅客，不能只有孩童。
  - **金額一律整數新台幣**：所有 `*Twd` 欄位都是整數。分帳除不盡的差額放進 `roundingRemainderTwd`（可為負），必須滿足 `Σ(count × totalPerPersonTwd) + roundingRemainderTwd = discountedTotalTwd`，例如 1,000 元 3 人分是每人 333、尾差 1。畫面上的分帳明細要顯示尾差，加總才對得上總額。
  - **時間與星期**：景點與交通段的時間一律 `HH:MM`（24 小時制）；`DayPlan.weekday` 必須等於 `date` 的星期（0 = 週日）。
- 開發與元件測試優先引用 `schema/mockTripData.ts` 假資料，確保 4 條產線平行推進。

## 3. 外部 API 限流與雙層備援鐵律

- **TDX 免費帳號限流（5 次／分鐘，取 Token 限 20 次／分鐘）**：
  - 雙鐵班表、國內線季班表、觀光 V2.1 與政府行政機關辦公日曆表一律由 GitHub Actions 排程**慢速預抓**（每次 TDX 請求間隔 ≥ 15 秒，含 HTTP 429 退避重試），輸出為靜態 JSON。
  - Cloudflare Worker 嚴禁使用記憶體變數快取 TDX Token，必須寫入 **Cloudflare KV**（Token 4–6 小時、海象預報 3 小時、當日開停航與即時動態 10–15 分鐘）。
- **離島民營船班雙層備援**：小琉球、綠島、蘭嶼等民營航線必讀 `data/ferry-fallback.json`，並在呈現時附上 `sourceUrl` 供旅客出發前複查。

## 4. 主機 AI 精準雙任務與 `Zod` 防呆

- 自架主機閘道僅提供 **① 口語轉 `TripInput` JSON（附 `missingFields`）** 與 **② 150 字真實數字白話導讀**；不開放自由多輪聊天，且嚴禁讓小模型編造時刻、票價與折扣。
- 所有從主機回傳的 JSON 進入引擎前必經 **Zod** 驗證；遇主機離線、逾時（10 秒）、佇列已滿（HTTP 429）、閘道回 HTTP 502（例如導讀裡出現輸入沒有的數字，整段作廢）或 Zod 驗證失敗，**必須靜默退回確定性規則引擎與純表單流程**，不得跳出阻斷式錯誤。

## 5. 前端互動、地圖與外帶標準

- 嚴守專案美學與文案基線（Warm Tactile 暖紙白 `#f4f4f0`／暖赭 `#d97706`、零巢狀卡片、無 Emoji 改用 `lucide-react` 1.5px SVG、數字啟用 `tabular-nums`、台灣白話口語）。
- 地圖採用 **內政部國土測繪中心 WMTS（`EMAP`）＋ `Leaflet`**（動態載入）。
- 行程微調一律採用 **`44px × 44px` 以上按鈕**（換順路點／上下調序／刪除／切雨備），不做易與手機捲動衝突的手指跨天拖拉。
- 必須保留 **免登入外帶包**（PWA `localStorage` 離線、每日 Google Maps 路線連結、`.ics` 行事曆匯出、`@media print` 列印及 Firestore 免登入唯讀分享＋複製副本）。

## 6. 交付與合併前自我檢查

倉庫的 `main` 分支已啟用保護規則：**嚴禁直接 commit、merge 或 push 到 `main`**，也**嚴禁使用 `--force`**。一律推送到 `feat/<角色>-<主題>` 分支並發起 Pull Request（若使用 `/backup` 技能也會自動改走分支＋PR 流程）。推送前必須在本機執行並確認全數通過：

```bash
npm run typecheck      # tsc --noEmit（嚴格型別 0 錯誤）
npx vitest run         # 單元與邊界測試 0 failed
npm run build          # Vite 靜態編譯 0 錯誤
git diff --stat        # 確認沒有任何檔案超出所屬目錄邊界（且未動到 package.json / package-lock.json）
```
