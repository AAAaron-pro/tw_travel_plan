# 外部資料與閘道串接層（`services/`）

- **專屬維護角色**：**路線情報員**
- **用途**：封裝 Cloudflare Worker（TDX Token / 海象 / 開停航 KV 快取）串接、靜態 JSON 讀取，以及向自架 **主機** 閘道發送請求與 10 秒逾時／HTTP 429 靜默退回機制。
- **邊界提醒**：禁止在前端程式碼放入 TDX `Client Secret` 或中央氣象署 API Key；所有從 **主機** 回傳的資料進入引擎前必須經過 `schema/trip.ts` 的 Zod 驗證。
