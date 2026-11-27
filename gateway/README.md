# 自架推論主機雙任務 FastAPI 閘道（`gateway/`）

- **專屬維護角色**：**架構師**（部署於自架 **主機**）
- **架構定位**：提供 `POST /api/parse-input`（口語轉 `TripInput` JSON + `missingFields`）與 `POST /api/summarize`（依據確定性計算結果產出 <= 150 字台灣口語導讀）。不開放多輪自由聊天，也不讓小模型編造時刻、票價與折扣。

## 安全與連線規範

1. **Ollama 僅限本機迴路存取**：預設連線 `http://127.0.0.1:11434`（模型 `qwen3.5:4b`、`options.num_ctx=4096`），啟動時會驗證主機名稱僅能為 `127.0.0.1`、`localhost` 或 `::1`，嚴禁對外網暴露 `11434` Port。
2. **併發保護與佇列上限**：`ConcurrencyGuard` 強制 `Semaphore(1)` 單一推理併發＋最多 3 筆排隊等待，第 5 筆同時連線會立即回傳 `HTTP 429` JSON，讓前端無縫退回純表單與確定性引擎。排隊超過 5 秒也視同排隊滿（429）；輪到時若旅客已離線就略過推論。
   - **導讀防捏造**：請求一律帶 `think: false`，並移除 `<think>` 文字；導讀超過 150 字時切在最後一個句號。導讀裡只要出現輸入 JSON 沒有的數字，整段作廢回 `502`，前端改用規則版文案。
3. **單一 IP 滑動視窗限流與輸入上限**：預設每 IP 每 60 秒最多 20 次請求（超過回傳 `HTTP 429` + `Retry-After`）；`POST /api/parse-input` 限制 500 字以內。`TRUST_PROXY_HEADERS` 預設為 `true`：只有來自本機（`127.0.0.1`／`::1`）的連線（也就是 cloudflared）才會改讀 `CF-Connecting-IP` 當旅客 IP，外部直連無法偽造；若沒有走 cloudflared 想關掉，設 `TRUST_PROXY_HEADERS=false`。
4. **環境變數控制 CORS**：透過 `CORS_ORIGINS`（逗號分隔）注入允許的前端網域（如 GitHub Pages 網域 `https://<your-org-or-user>.github.io` 與本機開發網域），明確禁止萬用字元 `*`。
5. **Cloudflare Turnstile（預留規格、本階段未實作）**：目前程式碼尚未啟用 Turnstile 驗證；未來正式上線若遇到高頻自動化流量，可於 `POST /api/*` 前置加入 Turnstile Token 驗證中介層。

## 本機啟動與測試指令

```bash
# 安裝依賴
pip install -r gateway/requirements.txt

# 啟動閘道（僅監聽本機，搭配 cloudflared 走 HTTPS 對外提供服務）
CORS_ORIGINS="https://your-account.github.io,http://localhost:5173" \
  uvicorn gateway.main:app --host 127.0.0.1 --port 8000

# 執行單元測試（以 httpx.MockTransport 模擬 127.0.0.1:11434）
pytest gateway/test_main.py -v
```
