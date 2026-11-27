import { z } from 'zod';

// ============================================================================
// 1. Input Contract Types & Zod Schemas
// ============================================================================

export const OriginRegionSchema = z.enum([
  'taipei_keelung',
  'taoyuan_hsinchu_miaoli',
  'taichung_changhua_nantou',
  'chiayi_yunlin',
  'tainan',
  'kaohsiung',
  'pingtung',
  'yilan_hualien_taitung',
]);
export type OriginRegion = z.infer<typeof OriginRegionSchema>;

export const RegionCodeSchema = z.enum([
  'penghu',
  'xiaoliuqiu',
  'taipei',
  'tainan',
  'hualien_taitung',
  'kinmen',
  'matsu',
  'green_island',
  'orchid_island',
  'other_tw',
]);
export type RegionCode = z.infer<typeof RegionCodeSchema>;

export const IdentityKeySchema = z.enum([
  'adult',
  'collegeStudent',
  'senior65Plus',
  'child3To12',
  'infantUnder3',
  'disabled',
  'disabledCompanion',
]);
export type IdentityKey = z.infer<typeof IdentityKeySchema>;

// 每個欄位都是「人頭數」：身障者與陪伴者分開算，離島居民可以只有部分團員
export const IdentityCountsSchema = z
  .object({
    adult: z.number().int().min(0),
    collegeStudent: z.number().int().min(0),
    senior65Plus: z.number().int().min(0),
    child3To12: z.number().int().min(0),
    infantUnder3: z.number().int().min(0),
    disabled: z.number().int().min(0),
    disabledCompanion: z.number().int().min(0),
    offshoreResidentCount: z.number().int().min(0),
  })
  .refine((g) => g.adult + g.collegeStudent + g.senior65Plus + g.disabled >= 1, {
    message: '至少要有 1 位成人、大專生、長輩或身障旅客，不能只有孩童',
    path: ['adult'],
  })
  .refine((g) => g.disabledCompanion <= g.disabled, {
    message: '每位身障旅客最多 1 位必要陪伴者',
    path: ['disabledCompanion'],
  })
  .refine((g) => g.offshoreResidentCount <= countTravelers(g), {
    message: '離島居民人數不能多於同行總人數',
    path: ['offshoreResidentCount'],
  });
export type IdentityCounts = Record<IdentityKey, number> & {
  offshoreResidentCount: number;
};

export function countTravelers(g: Record<IdentityKey, number>): number {
  return IdentityKeySchema.options.reduce((sum, key) => sum + g[key], 0);
}

export const TravelPassOwnedSchema = z.object({
  seniorCardCounty: z.string().min(1).optional(),
  tpassRegion: z.enum(['north', 'central', 'south', 'east', 'none']).optional(),
});
export type TravelPassOwned = {
  seniorCardCounty?: string;
  tpassRegion?: 'north' | 'central' | 'south' | 'east' | 'none';
};

export const TransportPreferenceSchema = z.enum([
  'hsr',
  'tra',
  'domestic_air',
  'ferry',
  'taiwan_tourist_shuttle',
  'rental_car',
  'scooter',
  'youbike',
]);
export type TransportPreference = z.infer<typeof TransportPreferenceSchema>;

export const LodgingTierSchema = z.enum(['budget', 'standard', 'premium', 'none']);
export type LodgingTier = z.infer<typeof LodgingTierSchema>;

const DATE_YYYY_MM_DD_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATETIME_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;

function isValidCalendarDate(value: string): boolean {
  if (!DATE_YYYY_MM_DD_RE.test(value)) return false;
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function isValidIsoDateTime(value: string): boolean {
  const match = ISO_DATETIME_RE.exec(value);
  if (!match) return false;
  const [, datePart, hourStr, minStr, secStr, tzPart, , tzHourStr, tzMinStr] = match;
  if (!isValidCalendarDate(datePart)) return false;
  const hour = Number(hourStr);
  const minute = Number(minStr);
  const second = Number(secStr);
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (tzPart !== 'Z') {
    const tzHour = Number(tzHourStr);
    const tzMin = Number(tzMinStr);
    if (tzHour > 23 || tzMin > 59) return false;
  }
  return Number.isFinite(Date.parse(value));
}

function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function calendarDateSchema(formatMessage: string) {
  return z
    .string()
    .regex(DATE_YYYY_MM_DD_RE, formatMessage)
    .refine(isValidCalendarDate, '須為有效的日曆日期');
}

const HttpUrlSchema = z
  .string()
  .url('須為有效的網址')
  .refine(isHttpOrHttpsUrl, '網址僅允許 http 或 https 協定');

export const TripInputSchema = z.object({
  origin: OriginRegionSchema,
  destination: RegionCodeSchema,
  startDate: calendarDateSchema('出發日期格式須為 YYYY-MM-DD'),
  days: z.number().int().min(1).max(30),
  budgetPerPersonTwd: z.number().int().min(0),
  lodgingTier: LodgingTierSchema,
  roomCount: z.number().int().min(1).optional(),
  group: IdentityCountsSchema,
  passes: TravelPassOwnedSchema,
  preferredTransport: z.array(TransportPreferenceSchema).min(1),
  pace: z.enum(['relaxed', 'balanced', 'packed']),
  avoidRainOutdoor: z.boolean().optional(),
});
export type TripInput = {
  origin: OriginRegion;
  destination: RegionCode;
  startDate: string;
  days: number;
  budgetPerPersonTwd: number;
  lodgingTier: LodgingTier;
  roomCount?: number;
  group: IdentityCounts;
  passes: TravelPassOwned;
  preferredTransport: TransportPreference[];
  pace: 'relaxed' | 'balanced' | 'packed';
  avoidRainOutdoor?: boolean;
};

// ============================================================================
// 2. Output Contract Types & Zod Schemas
// ============================================================================

export const SeaRiskLevelSchema = z.enum(['green', 'amber', 'red']);
export type SeaRiskLevel = z.infer<typeof SeaRiskLevelSchema>;

export const SeaRiskInfoSchema = z.object({
  level: SeaRiskLevelSchema,
  waveHeightM: z.number().min(0).optional(),
  warning: z.string().min(1).optional(),
});

export const TransportLegSchema = z.object({
  mode: TransportPreferenceSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  departureTime: z.string().min(1).optional(),
  arrivalTime: z.string().min(1).optional(),
  estimatedMinutes: z.number().int().min(1),
  source: z.enum(['tdx_live', 'tdx_static', 'ferry_fallback', 'distance_estimate']),
  sourceUrl: HttpUrlSchema.optional(),
  groupTotalFareTwd: z.number().int().min(0),
  discountNotes: z.array(z.string()),
  seaRisk: SeaRiskInfoSchema.optional(),
});
export type TransportLeg = {
  mode: TransportPreference;
  from: string;
  to: string;
  departureTime?: string;
  arrivalTime?: string;
  estimatedMinutes: number;
  source: 'tdx_live' | 'tdx_static' | 'ferry_fallback' | 'distance_estimate';
  sourceUrl?: string;
  groupTotalFareTwd: number;
  discountNotes: string[];
  seaRisk?: { level: SeaRiskLevel; waveHeightM?: number; warning?: string };
};

export const CuratedSpotSchema = z.object({
  id: z.string().min(1),
  region: RegionCodeSchema,
  name: z.string().min(1),
  category: z.enum(['sightseeing', 'food', 'indoor_backup', 'lodging']),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  stayMinutes: z.number().int().min(1),
  closedDays: z.array(z.number().int().min(0).max(6)),
  isIndoor: z.boolean(),
  wheelchairAndStrollerFriendly: z.boolean(),
  estimatedCostTwd: z.number().int().min(0),
  source: z.enum(['curated', 'tdx_v2']),
  tips: z.string().min(1).optional(),
});
export type CuratedSpot = {
  id: string;
  region: RegionCode;
  name: string;
  category: 'sightseeing' | 'food' | 'indoor_backup' | 'lodging';
  lat: number;
  lng: number;
  stayMinutes: number;
  closedDays: number[];
  isIndoor: boolean;
  wheelchairAndStrollerFriendly: boolean;
  estimatedCostTwd: number;
  source: 'curated' | 'tdx_v2';
  tips?: string;
};

export const DayStopSchema = z.object({
  stopId: z.string().min(1),
  spot: CuratedSpotSchema,
  startTime: z.string().regex(TIME_HH_MM_RE, '開始時間格式須為 HH:MM'),
  endTime: z.string().regex(TIME_HH_MM_RE, '結束時間格式須為 HH:MM'),
  isUsingBackup: z.boolean().optional(),
  backupSpot: CuratedSpotSchema.optional(),
  googleMapsUrl: HttpUrlSchema,
});
export type DayStop = {
  stopId: string;
  spot: CuratedSpot;
  startTime: string;
  endTime: string;
  isUsingBackup?: boolean;
  backupSpot?: CuratedSpot;
  googleMapsUrl: string;
};

export const DayPlanSchema = z.object({
  dayIndex: z.number().int().min(1),
  date: calendarDateSchema('日期格式須為 YYYY-MM-DD'),
  weekday: z.number().int().min(0).max(6),
  isHolidayOrWeekend: z.boolean(),
  seaRisk: SeaRiskInfoSchema.optional(),
  legs: z.array(TransportLegSchema),
  stops: z.array(DayStopSchema),
  googleMapsRouteUrl: HttpUrlSchema,
});
export type DayPlan = {
  dayIndex: number;
  date: string;
  weekday: number;
  isHolidayOrWeekend: boolean;
  seaRisk?: { level: SeaRiskLevel; waveHeightM?: number; warning?: string };
  legs: TransportLeg[];
  stops: DayStop[];
  googleMapsRouteUrl: string;
};

export const IdentityCostShareSchema = z.object({
  identity: IdentityKeySchema,
  count: z.number().int().min(1),
  transportPerPersonTwd: z.number().int().min(0),
  lodgingPerPersonTwd: z.number().int().min(0),
  activityPerPersonTwd: z.number().int().min(0),
  totalPerPersonTwd: z.number().int().min(0),
  appliedDiscounts: z.array(z.string()),
});
export type IdentityCostShare = {
  identity: IdentityKey;
  count: number;
  transportPerPersonTwd: number;
  lodgingPerPersonTwd: number;
  activityPerPersonTwd: number;
  totalPerPersonTwd: number;
  appliedDiscounts: string[];
};

export const WeekdayShiftSavingHintSchema = z.object({
  suggestedStartDate: calendarDateSchema('建議日期格式須為 YYYY-MM-DD'),
  estimatedSaveTwd: z.number().int().min(0),
  reason: z.string().min(1),
});

export const BudgetBreakdownSchema = z.object({
  originalTotalTwd: z.number().int().min(0),
  discountedTotalTwd: z.number().int().min(0),
  savedTotalTwd: z.number().int().min(0),
  transportTwd: z.number().int().min(0),
  lodgingTwd: z.number().int().min(0),
  activityAndFoodTwd: z.number().int().min(0),
  isOverBudget: z.boolean(),
  weekdayShiftSavingHint: WeekdayShiftSavingHintSchema.optional(),
  perIdentitySplit: z.array(IdentityCostShareSchema).min(1),
  // 尾差 = discountedTotalTwd − Σ(count × totalPerPersonTwd)；整數分帳除不盡時由它補平，可為負
  roundingRemainderTwd: z.number().int(),
}).refine(
  (b) =>
    b.perIdentitySplit.reduce((sum, s) => sum + s.count * s.totalPerPersonTwd, 0) +
      b.roundingRemainderTwd ===
    b.discountedTotalTwd,
  { message: '各身分分帳加總加上尾差須等於優惠後總額', path: ['roundingRemainderTwd'] }
);
export type BudgetBreakdown = {
  originalTotalTwd: number;
  discountedTotalTwd: number;
  savedTotalTwd: number;
  transportTwd: number;
  lodgingTwd: number;
  activityAndFoodTwd: number;
  isOverBudget: boolean;
  weekdayShiftSavingHint?: {
    suggestedStartDate: string;
    estimatedSaveTwd: number;
    reason: string;
  };
  perIdentitySplit: IdentityCostShare[];
  roundingRemainderTwd: number;
};

export const ReviewWarningSchema = z.object({
  severity: z.enum(['red', 'amber', 'info']),
  code: z.enum(['CLOSED_DAY', 'TIGHT_TRANSFER', 'OVER_BUDGET', 'SEA_RISK', 'HOLIDAY_SURGE']),
  message: z.string().min(1),
  dayIndex: z.number().int().min(1).optional(),
});
export type ReviewWarning = {
  severity: 'red' | 'amber' | 'info';
  code: 'CLOSED_DAY' | 'TIGHT_TRANSFER' | 'OVER_BUDGET' | 'SEA_RISK' | 'HOLIDAY_SURGE';
  message: string;
  dayIndex?: number;
};

export const TripPlanResultSchema = z.object({
  input: TripInputSchema,
  days: z.array(DayPlanSchema).min(1),
  budget: BudgetBreakdownSchema,
  reviewWarnings: z.array(ReviewWarningSchema),
  aiSummary: z.string().min(1).max(150).optional(),
  modeUsed: z.enum(['ai_assisted', 'rule_only']),
  generatedAt: z
    .string()
    .regex(ISO_DATETIME_RE, '時間戳記須為 ISO-8601 格式')
    .refine(isValidIsoDateTime, '時間戳記須為有效的 ISO-8601 日期時間'),
});
export type TripPlanResult = {
  input: TripInput;
  days: DayPlan[];
  budget: BudgetBreakdown;
  reviewWarnings: ReviewWarning[];
  aiSummary?: string;
  modeUsed: 'ai_assisted' | 'rule_only';
  generatedAt: string;
};
