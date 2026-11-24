# 台灣國內與離島旅遊規劃網頁

專為台灣本島與離島自由行打造的混合高可用規劃網站，結合同團混搭身分優惠與 AA 分帳、平假日住宿係數、海象連動雨備及離線 PWA 外帶包。

## 團隊分工與目錄邊界

所有成員僅在所屬模組目錄內開發，禁止私自修改共用合約或跨界改寫其他模組：

| 角色 | 專屬維護目錄 | 核心職責 |
| :--- | :--- | :--- |
| **架構師** | `schema/`、`.github/`、`gateway/`、根目錄設定檔 | 鎖定 `schema/trip.ts` 雙向型別與 Zod 驗證、維護自架 **主機** FastAPI 閘道與 GitHub CI/CD |
| **路線情報員** | `services/`、`data/`（`data/curated/`、`data/static/`） | TDX／氣象署預抓管線、Cloudflare KV 共用快取、民營船班雙層備援與主機降級封裝 |
| **優惠精算師** | `engine/`（及個人認領的 `data/curated/` 區段） | 出發地配對、同團混搭身分優惠與 AA 分帳、平假日住宿係數、排程與自動抓錯 |
| **介面設計師** | `src/`（及個人認領的 `data/curated/` 區段） | Warm Tactile 暖白觸控版面、國土測繪中心 WMTS＋Leaflet 地圖、PWA 離線與匯出 |

- 若開發過程發現 `schema/trip.ts` 缺少欄位，必須立即停止改動共用檔，並在 PR 中填寫 `SCHEMA_CHANGE_REQUEST` 交由 **架構師** 對齊全隊後統一更新。

## 系統架構重點（Option C 混合高可用）

- **金鑰保護**：前端程式碼嚴禁包含 TDX `Client Secret` 或中央氣象署 API Key，一律透過 Cloudflare Worker／KV 或 GitHub Actions 靜態預抓資料取得。
- **主機雙任務閘道（`gateway/`）**：自架 **主機** 僅在本機迴路（`127.0.0.1:11434`）呼叫 `qwen3.5:4b`（`num_ctx=4096`），提供 `POST /api/parse-input` 與 `POST /api/summarize`；時刻表、票價與分帳數字完全由確定性規則引擎計算。
- **優雅降級**：當 **主機** 離線、逾時（10 秒）或佇列額滿（HTTP `429`）時，前端自動無縫切回純表單與規則引擎流程。

## 本機開發與檢查指令

```bash
# 1. 安裝前端依賴
npm install

# 2. 啟動本機開發伺服器
npm run dev

# 3. PR 前必跑檢查（型別、單元測試、靜態編譯）
npm run typecheck
npx vitest run
npm run build

# 4. 自架主機閘道本機測試與啟動
pip install -r gateway/requirements.txt
pytest gateway/test_main.py -v
uvicorn gateway.main:app --host 127.0.0.1 --port 8000
```

## 分支與協作流程

1. 從 `main` 開出角色功能分支，命名格式為 `feat/<角色>-<主題>`。
2. 確認 `npm run typecheck`、`npx vitest run`、`npm run build` 及 `git diff --stat` 皆符合目錄邊界後，依 `.github/pull_request_template.md` 模板發起 PR。
