## 變更摘要與所屬角色

- 負責角色（請勾選）：
  - [ ] 架構師（`schema/`、`.github/`、`gateway/`、根目錄設定檔）
  - [ ] 路線情報員（`services/`、`data/`）
  - [ ] 優惠精算師（`engine/`、`data/curated/` 認領區段）
  - [ ] 介面設計師（`src/`、`data/curated/` 認領區段）
- 變更說明：

## 合併前共用檢查

- [ ] `npm run typecheck` 通過（0 錯誤）
- [ ] `npx vitest run` 通過（0 失敗）
- [ ] `npm run build` 通過（0 錯誤）
- [ ] `git diff --stat` 已確認未跨出自身角色目錄邊界

## 各角色自我檢查清單

### 架構師
- [ ] `schema/trip.ts` 欄位與 Zod 驗證維持雙向一致
- [ ] `gateway/` 僅限呼叫 `127.0.0.1:11434`、具備併發與 IP 限流、未放寬 CORS 為 `*`

### 路線情報員
- [ ] TDX 預抓腳本請求間隔 >= 15 秒且含 HTTP 429 退避重試
- [ ] Worker 使用 Cloudflare KV 快取且未將任何 Secret 寫入前端
- [ ] 離島民營船班附有 `ferry-fallback` 與 `sourceUrl` 查核連結

### 優惠精算師
- [ ] 票價、身分優惠、AA 分帳與平假日係數皆為確定性純函式計算
- [ ] 景點排程已檢查 `closedDays`、轉乘緩衝與海象雨備條件

### 介面設計師
- [ ] 遵守 Warm Tactile 設計與零巢狀卡片原則，禁用原始 Emoji，改用 `lucide-react` 1.5px SVG
- [ ] 金額／車次／時間已套用 `tabular-nums`，互動按鈕達 `44px × 44px` 以上
- [ ] 介面文案皆為自然台灣繁體中文，且 **主機** 離線時表單與離線外帶功能仍正常運作

## SCHEMA_CHANGE_REQUEST（若無合約異動可保留空白）

> 若開發過程中發現 `schema/trip.ts` 缺少欄位，請停止直接修改共用檔，並於下方填寫需求供 **架構師** 統一協調更新：

- **欄位名稱**：
- **建議 TypeScript 型別**：
- **Zod 驗證規則**：
- **用途與影響範圍**：
