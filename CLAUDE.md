# 台灣國內與離島旅遊規劃網頁 — 團隊共用 AI 協作規範

開工前請先完整閱讀專案根目錄的 `AGENTS.md` 與 `.agents/skills/tw-trip-contract/SKILL.md`，並遵守以下核心邊界：

1. **角色目錄隔離（禁止越界改檔）**：
   - **架構師**：`schema/`、`.github/`、`gateway/`、根目錄設定檔與規範檔
   - **路線情報員**：`services/`、`data/`
   - **優惠精算師**：`engine/`（及認領的 `data/curated/` 區段）
   - **介面設計師**：`src/`（及認領的 `data/curated/` 區段）
   - 若發現 `schema/trip.ts` 缺少欄位，請停止直接修改共用檔，改在 PR 內填寫 `SCHEMA_CHANGE_REQUEST`。

2. **分支與 Git 推送鐵律（相容 `protect-main`）**：
   - **嚴禁**直接在 `main` 上 commit、merge 或 `git push origin main`，也禁止使用 `--force`。
   - 一律從最新 `main` 切出 `feat/<角色>-<主題>` 分支開發並推送功能分支，再依 `.github/pull_request_template.md` 發起 Pull Request（若使用 `/backup` 技能亦須依此分支＋PR 流程執行）。

3. **禁止私自改動根目錄依賴檔**：
   - 專案已預裝 `react`、`zod`、`lucide-react`、`vite-plugin-pwa`、`leaflet`、`react-leaflet` 與 `@types/leaflet`。
   - 非架構師分支禁止執行會改寫 `package.json` 或 `package-lock.json` 的安裝指令，有新套件需求請先請架構師統一加進 `main`。

4. **介面美學、觸控與台灣在地口語**：
   - 採 Warm Tactile 暖紙白 `#f4f4f0`／暖赭 `#d97706` 視覺、零巢狀卡片、無原始 Emoji（統一用 `lucide-react` 1.5px SVG）、金額時刻啟用 `tabular-nums`、按鈕至少 `44px × 44px`。
   - 文案使用自然台灣繁體中文，禁用翻譯腔與大陸網路黑話；**主機**離線或逾時必須無縫退回純表單與規則引擎。

5. **推送前必跑自我檢查**：
   ```bash
   npm run typecheck
   npx vitest run
   npm run build
   git diff --stat
   ```
