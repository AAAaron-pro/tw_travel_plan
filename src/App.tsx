import { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Compass,
  MapPin,
  TrainFront,
  Umbrella,
  Users,
  Wallet,
} from 'lucide-react';
import { MOCK_TRIP_PLANS } from '../schema/mockTripData';
import type { IdentityKey, RegionCode } from '../schema/trip';

const REGION_LABELS: Record<RegionCode, string> = {
  penghu: '澎湖',
  xiaoliuqiu: '小琉球',
  taipei: '台北',
  tainan: '台南',
  hualien_taitung: '花東',
  kinmen: '金門',
  matsu: '馬祖',
  green_island: '綠島',
  orchid_island: '蘭嶼',
  other_tw: '台灣其他地區',
};

const IDENTITY_LABELS: Record<IdentityKey, string> = {
  adult: '一般成人',
  collegeStudent: '大專生',
  senior65Plus: '65 歲以上長輩',
  child3To12: '3–12 歲孩童',
  infantUnder3: '未滿 3 歲幼兒',
  disabled: '身心障礙者（愛心票）',
  disabledCompanion: '必要陪伴者（愛心票）',
};

export function App() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState(1);

  const plan = MOCK_TRIP_PLANS[selectedIndex] ?? MOCK_TRIP_PLANS[0];
  const activeDay =
    plan.days.find((d) => d.dayIndex === selectedDayIndex) ?? plan.days[0];
  const totalTravelers = plan.budget.perIdentitySplit.reduce(
    (sum, item) => sum + item.count,
    0
  );

  const handleSelectPlan = (index: number) => {
    setSelectedIndex(index);
    setSelectedDayIndex(1);
  };

  return (
    <div
      className="min-h-[100dvh] bg-[var(--bg-canvas)] text-[var(--text-primary)]"
      style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
    >
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--accent-primary)]">
              <Compass size={22} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                台灣國內與離島旅遊規劃
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                合約骨架展示版（介面設計師接手 src/ 開發起點）
              </p>
            </div>
          </div>

          <nav aria-label="範本行程切換" className="flex flex-wrap gap-2">
            {MOCK_TRIP_PLANS.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const title =
                item.input.destination === 'penghu'
                  ? '台北 → 澎湖 3 天 2 夜'
                  : '台中 → 台南 2 天 1 夜';
              return (
                <button
                  key={item.input.destination}
                  type="button"
                  onClick={() => handleSelectPlan(idx)}
                  aria-pressed={isSelected}
                  className={`tactile-btn inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-4 py-2 text-sm font-medium ${
                    isSelected
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-canvas)]'
                  }`}
                >
                  <MapPin size={16} strokeWidth={1.5} aria-hidden="true" />
                  <span>{title}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 pt-6 sm:px-6">
        {/* 總覽指標列（單層平鋪、hairline 分隔，無巢狀卡片） */}
        <section
          aria-label="行程總覽"
          className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
        >
          <div className="grid grid-cols-1 divide-y divide-[var(--border-subtle)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="flex items-start gap-3 p-4">
              <Calendar
                size={20}
                strokeWidth={1.5}
                className="mt-0.5 text-[var(--accent-primary)]"
                aria-hidden="true"
              />
              <div>
                <p className="text-xs text-[var(--text-secondary)]">
                  目的地與出發日
                </p>
                <p className="tabular-nums mt-1 text-base font-semibold">
                  {REGION_LABELS[plan.input.destination]} · {plan.input.days} 天
                </p>
                <p className="tabular-nums text-xs text-[var(--text-secondary)]">
                  {plan.input.startDate} 出發
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4">
              <Users
                size={20}
                strokeWidth={1.5}
                className="mt-0.5 text-[var(--accent-primary)]"
                aria-hidden="true"
              />
              <div>
                <p className="text-xs text-[var(--text-secondary)]">
                  同行人數與模式
                </p>
                <p className="tabular-nums mt-1 text-base font-semibold">
                  共 {totalTravelers} 人混搭團
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {plan.modeUsed === 'ai_assisted'
                    ? '主機導讀輔助模式'
                    : '離線確定性規則模式'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4">
              <Wallet
                size={20}
                strokeWidth={1.5}
                className="mt-0.5 text-[var(--accent-primary)]"
                aria-hidden="true"
              />
              <div>
                <p className="text-xs text-[var(--text-secondary)]">
                  優惠後全團總計
                </p>
                <p className="tabular-nums mt-1 text-base font-semibold">
                  NT$ {plan.budget.discountedTotalTwd.toLocaleString('zh-TW')}
                </p>
                <p className="tabular-nums text-xs text-[var(--accent-primary)]">
                  已省 NT$ {plan.budget.savedTotalTwd.toLocaleString('zh-TW')}
                </p>
              </div>
            </div>
          </div>

          {plan.aiSummary && (
            <p className="border-t border-[var(--border-subtle)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              {plan.aiSummary}
            </p>
          )}
        </section>

        {/* 警示與省錢提示 */}
        {(plan.reviewWarnings.length > 0 ||
          plan.budget.weekdayShiftSavingHint) && (
          <section
            aria-label="行程提醒"
            className="divide-y divide-[var(--border-subtle)] rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          >
            {plan.reviewWarnings.map((warning, idx) => (
              <div
                key={`${warning.code}-${idx}`}
                className={`flex items-start gap-3 px-4 py-3 text-sm ${
                  warning.severity === 'amber'
                    ? 'bg-[var(--status-amber-bg)] text-[var(--status-amber-text)]'
                    : 'bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
                }`}
              >
                <AlertTriangle
                  size={18}
                  strokeWidth={1.5}
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <span>{warning.message}</span>
              </div>
            ))}
            {plan.budget.weekdayShiftSavingHint && (
              <div className="flex items-start gap-3 px-4 py-3 text-sm text-[var(--text-primary)]">
                <Calendar
                  size={18}
                  strokeWidth={1.5}
                  className="mt-0.5 shrink-0 text-[var(--accent-primary)]"
                  aria-hidden="true"
                />
                <span className="tabular-nums">
                  {plan.budget.weekdayShiftSavingHint.reason}
                </span>
              </div>
            )}
          </section>
        )}

        {/* 每日行程節點 */}
        <section
          aria-label="每日行程"
          className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
            {plan.days.map((day) => {
              const active = day.dayIndex === activeDay.dayIndex;
              return (
                <button
                  key={day.dayIndex}
                  type="button"
                  onClick={() => setSelectedDayIndex(day.dayIndex)}
                  aria-pressed={active}
                  className={`tactile-btn tabular-nums rounded-[var(--radius-control)] border px-4 py-2 text-sm font-medium ${
                    active
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-canvas)]'
                  }`}
                >
                  第 {day.dayIndex} 天（{day.date.slice(5)}）
                </button>
              );
            })}
          </div>

          <div className="divide-y divide-[var(--border-subtle)]">
            {activeDay.legs.map((leg, i) => (
              <div
                key={`${leg.mode}-${i}`}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2.5 text-sm font-medium">
                  <TrainFront
                    size={18}
                    strokeWidth={1.5}
                    className="shrink-0 text-[var(--accent-primary)]"
                    aria-hidden="true"
                  />
                  <span>
                    {leg.from} → {leg.to}
                  </span>
                </div>
                <div className="tabular-nums flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                  {leg.departureTime && (
                    <span>
                      {leg.departureTime}–{leg.arrivalTime}
                    </span>
                  )}
                  <span>NT$ {leg.groupTotalFareTwd.toLocaleString('zh-TW')}</span>
                </div>
              </div>
            ))}

            {activeDay.stops.map((stop) => (
              <div key={stop.stopId} className="px-4 py-3.5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="font-medium">{stop.spot.name}</div>
                  <div className="tabular-nums text-sm text-[var(--text-secondary)]">
                    {stop.startTime}–{stop.endTime}
                  </div>
                </div>
                {stop.backupSpot && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <Umbrella size={14} strokeWidth={1.5} aria-hidden="true" />
                    <span>室內雨備：{stop.backupSpot.name}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* AA 分帳明細 */}
        <section
          aria-label="身分優惠與 AA 分帳"
          className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
        >
          <div className="border-b border-[var(--border-subtle)] px-4 py-3">
            <h2 className="text-base font-semibold">同團混搭身分 AA 分帳</h2>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {plan.budget.perIdentitySplit.map((share) => (
              <div
                key={share.identity}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <span className="font-medium">
                    {IDENTITY_LABELS[share.identity]}
                  </span>
                  <span className="tabular-nums ml-2 text-sm text-[var(--text-secondary)]">
                    × {share.count} 人
                  </span>
                  {share.appliedDiscounts.length > 0 && (
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      {share.appliedDiscounts.join(' · ')}
                    </p>
                  )}
                </div>
                <div className="tabular-nums text-sm font-semibold">
                  每人 NT$ {share.totalPerPersonTwd.toLocaleString('zh-TW')}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
