---
name: backup
description: "把目前的變更推送到團隊功能分支並準備 Pull Request（禁止直推 main）。當使用者明確說『儲存』『保存』『存到雲端』『commit』『存起來』『備份』『上傳』『推上去』『發 PR』時觸發。不要在 AI 自己剛改完檔就主動執行，需先等使用者同意。"
user-invocable: true
---

# /backup — 功能分支推送與 PR 準備流程

使用台灣繁體中文與白話說明回覆。

本專案的 `main` 分支已啟用保護規則（`protect-main`），**禁止**任何非管理員分支直接 `merge` 或 `push` 到 `main`，也**嚴禁** `--force` 強制推送。所有開發成果一律推送到 `feat/<角色>-<主題>` 分支並透過 Pull Request 合併。

## 強制執行步驟

### 1. 檢查目前所在分支（禁止在 `main` 上直接提交）

```bash
git branch --show-current
```

* 若輸出為 `main`：先看 `git status --porcelain` 改動了哪個資料夾，自動切出對應的角色功能分支再繼續：
  * 改 `services/` 或 `data/` $\rightarrow$ `git checkout -b feat/route-intel-<簡短主題>`
  * 改 `engine/` $\rightarrow$ `git checkout -b feat/fare-engine-<簡短主題>`
  * 改 `src/` $\rightarrow$ `git checkout -b feat/ui-<簡短主題>`
  * 改 `schema/`、`.github/`、`gateway/` $\rightarrow$ `git checkout -b feat/arch-<簡短主題>`
* 若已經在 `feat/...` 分支上：直接沿用該分支。

### 2. 檢查目錄邊界與鎖定檔（避免合併衝突）

```bash
git status --porcelain
```

* 若無任何變更：直接回覆「目前沒有需要推送的變更」，結束流程。
* **邊界防呆檢查**：若非架構師分支卻改動到 `package.json`、`package-lock.json`、`schema/`、`.github/`、`gateway/` 或根目錄規範檔，**必須先停下來提醒使用者**，確認還原越界檔案或請架構師統一處理，禁止直接硬推。

### 3. 推送前必跑三項檢查

在提交與推送之前，必須先在本機跑完以下三道檢查且全部通過（任一失敗需先修到 0 錯誤）：

```bash
npm run typecheck
npx vitest run
npm run build
```

### 4. 請使用者確認摘要後再提交並推送功能分支

先用白話列出這次修改的檔案與功能摘要，獲得使用者同意後再執行：

```bash
git add -A
git commit -m "<依變更撰寫之簡短說明>"
git push -u origin HEAD
```

* **絕對禁止**在本步驟執行 `git checkout main`、`git merge` 或 `git push origin main`。

### 5. 建立或引導開啟 Pull Request

檢查是否已安裝且登入 GitHub CLI：

```bash
gh auth status
```

* **若 `gh` 已登入**：依據 `.github/pull_request_template.md` 格式自動填入變更摘要與檢查勾選，執行 `gh pr create --base main ...` 建立 PR，並將 PR 網址回報給使用者。
* **若無 `gh` CLI 或尚未登入**：直接把填妥的 PR 標題、模板內文，以及以下一鍵開啟 PR 網址提供給使用者點擊送出：
  `https://github.com/AAAaron-pro/tw_travel_plan/compare/main...<當前分支名>?expand=1`
