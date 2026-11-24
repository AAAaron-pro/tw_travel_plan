# 確定性行程與優惠計算引擎（`engine/`）

- **專屬維護角色**：**優惠精算師**
- **用途**：實作純函式計算核心，涵蓋出發地配對、同團混搭身分優惠與 AA 分帳（`perIdentitySplit`）、平假日／連假住宿溢價係數（`weekdayShiftSavingHint`）、門到門分段排程、單點微調重算與自動抓錯警示（`ReviewWarning`）。
- **邊界提醒**：嚴禁讓 AI 模型取代確定性計算；輸入與輸出必須嚴格對齊 `schema/trip.ts` 的 `TripInput` 與 `TripPlanResult`。
