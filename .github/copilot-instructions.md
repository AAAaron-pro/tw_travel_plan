# GitHub Copilot / 編輯器團隊協作指引

請務必同時遵循專案根目錄 `AGENTS.md` 與 `.agents/skills/tw-trip-contract/SKILL.md`：

- **目錄隔離**：依目前任務所屬角色（架構師／路線情報員／優惠精算師／介面設計師），只修改該角色允許的目錄（`schema/`、`services/`＋`data/`、`engine/`、`src/`），嚴禁未協調修改共用 `schema/trip.ts` 或他人目錄。
- **依賴鎖定**：已預裝 `leaflet`、`react-leaflet`、`zod`、`lucide-react`、`vite-plugin-pwa`、`jsdom`、`@testing-library/react`、`@testing-library/dom`；非架構師分支不可改動 `package.json` 與 `package-lock.json`。
- **Git 流程**：倉庫已啟用 `protect-main`，禁止建議或執行直推 `main` 或 `--force`；一律開 `feat/<角色>-<主題>` 分支並發起 Pull Request。
- **前端規範**：遵守 Warm Tactile 暖紙白（`#f4f4f0`／`#d97706`）、零巢狀、禁用原始 Emoji 改用 `lucide-react` SVG、`tabular-nums`、`44px` 觸控熱區，以及自然台灣繁體中文口語。
- **合併前檢查**：送出 PR 前確認 `npm run typecheck`、`npx vitest run`、`npm run build` 全數通過。
