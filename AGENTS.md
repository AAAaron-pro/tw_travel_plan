# 台灣旅遊規劃網頁專案規範

## 1. 介面美學與觸控品質（對齊 `anti-slop-design` & `tablet-touch-compatibility`）
- **視覺原型**：採用 `Warm Tactile`（日間暖白 `#f4f4f0`、主強調色暖赭 `#d97706` / 或高對比深海藍）或 `Editorial & Refined` 路線，嚴禁暗底紫藍漸層光暈（AI Dark Mode Blob）與無意義發光動畫。
- **反 AI Slop 鐵律**：
  - 禁用原始 Emoji（🚀、💡、🔥 等）作為功能按鈕或欄位圖示，一律使用統一筆寬（1.5px / 2px）的向量 SVG（如 Lucide）。
  - 嚴禁 Box-in-Box 巢狀圓角卡片；單一視圖維持 `Zero-Nesting`，區塊內用留白與 1px hairline 格線分隔。
  - 所有金額、票價、車次時間與里程一律啟用 `font-variant-numeric: tabular-nums`。
  - 每個視覺區塊嚴守 `1-to-3` 焦點原則（1 個主行動 + 最多 3 個輔助控制）。
  - 所有互動元件須具備 8 態回饋（含 `:focus-visible` 外框與 `:active` 輕微按壓縮放），過渡時間控制在 200ms 內。
- **平板與手機觸控**：最小點擊熱區 `44px × 44px`、元件間距至少 `8px`、禁止依賴 `:hover` 才能觸發操作、視窗高度採用 `100dvh` 並保留 `env(safe-area-inset-bottom)`。

## 2. 台灣在地化文案規範（對齊 `humanizer-tw`）
- 介面標題、表單選項、優惠說明與錯誤提示一律使用自然台灣繁體中文。
- 禁用 AI 翻譯腔與大陸互聯網黑話（禁止：「賦能、痛點、閉環、賽道、助力、抓手、該、此、予以、進行處理、讓我們拭目以待」），改用直白口語（如「學生票」「長輩 5 折」「船可能停開，幫你準備了雨備」）。

## 3. 系統架構與事實邊界（Option C 混合高可用）
- **金鑰保護**：部署於 GitHub Pages 的前端程式碼不得包含 TDX `Client Secret` 或中央氣象署 API Key；須經由雲端 Serverless Proxy（Cloudflare Workers / Vercel）或 GitHub Actions 靜態快取資料。
- **AI 與規則分離**：本地小模型（如 Ollama）僅負責「口語需求解析成 JSON」與「自然文案整理」。時刻表、票價、海象風險、預算加總與身分優惠折扣，**必須**由官方 API 與確定性規則引擎計算，禁止讓 LLM 憑記憶編造數字。
- **優雅降級**：當自架推論主機離線、逾時或排隊滿載時，前端必須自動無縫切換為純表單＋規則引擎排程，確保核心規劃功能 100% 可用。

## 4. 四人團隊 AI 分支、套件與推送鐵律（相容 `protect-main`）
- **目錄隔離邊界**：
  - **架構師**：`schema/`、`.github/`、`gateway/`、根目錄設定檔與規範檔
  - **路線情報員**：`services/`、`data/`
  - **優惠精算師**：`engine/`（及個人認領之 `data/curated/` 區段）
  - **介面設計師**：`src/`（及個人認領之 `data/curated/` 區段）
- **禁直推 `main`**：倉庫已啟用 `protect-main` 分支保護。任何 AI 收到「儲存／上傳／commit／push」時，**嚴禁**在 `main` 上直接提交、本地 `merge` 或 `git push origin main`，亦禁止 `--force`。若目前位於 `main`，必須先切出 `feat/<角色>-<主題>` 分支後再推送並發起 Pull Request。
- **依賴鎖定規則**：根目錄 `package.json` 與 `package-lock.json` 已預裝 `leaflet`、`react-leaflet`、`zod`、`lucide-react`、`vite-plugin-pwa`。非架構師分支禁止執行會改動根目錄依賴檔的套件安裝指令（缺套件由架構師統一更新進 `main`）。
- **推送前必跑三項檢查**：任何分支推送前必須於本機通過 `npm run typecheck`、`npx vitest run`、`npm run build`，並以 `git diff --stat` 確認未越界改動他人目錄或共用 `schema/`。
