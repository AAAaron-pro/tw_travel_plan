import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  BudgetBreakdownSchema,
  CuratedSpotSchema,
  DayPlanSchema,
  DayStopSchema,
  IdentityCountsSchema,
  IdentityCostShareSchema,
  LodgingTierSchema,
  OriginRegionSchema,
  RegionCodeSchema,
  ReviewWarningSchema,
  SeaRiskLevelSchema,
  TransportLegSchema,
  TransportPreferenceSchema,
  TravelPassOwnedSchema,
  TripInputSchema,
  TripPlanResultSchema,
  WeekdayShiftSavingHintSchema,
  type TripInput,
  type TripPlanResult,
} from './trip';
import {
  MOCK_TRIP_PLANS,
  mockPenghuTripPlan,
  mockTainanTripPlan,
} from './mockTripData';

// Compile-time bidirectionality checks: Zod inferred types must remain mutually assignable with TS types
type AssertAssignable<To, From extends To> = [To, From] | boolean;

describe('schema/trip.ts bidirectional contract & Zod validation', () => {
  it('validates all enum and atomic sub-schemas cleanly', () => {
    const inputToTs: AssertAssignable<TripInput, z.infer<typeof TripInputSchema>> = true;
    const tsToInput: AssertAssignable<z.infer<typeof TripInputSchema>, TripInput> = true;
    const resultToTs: AssertAssignable<TripPlanResult, z.infer<typeof TripPlanResultSchema>> = true;
    const tsToResult: AssertAssignable<z.infer<typeof TripPlanResultSchema>, TripPlanResult> = true;
    expect(inputToTs && tsToInput && resultToTs && tsToResult).toBe(true);

    expect(OriginRegionSchema.safeParse('taipei_keelung').success).toBe(true);
    expect(RegionCodeSchema.safeParse('penghu').success).toBe(true);
    expect(LodgingTierSchema.safeParse('standard').success).toBe(true);
    expect(SeaRiskLevelSchema.safeParse('amber').success).toBe(true);
    expect(TransportPreferenceSchema.safeParse('taiwan_tourist_shuttle').success).toBe(true);
    expect(TravelPassOwnedSchema.safeParse({ tpassRegion: 'central' }).success).toBe(true);
  });

  it('accepts valid TripInput payloads', () => {
    const res = TripInputSchema.safeParse(mockPenghuTripPlan.input);
    expect(res.success).toBe(true);

    const tainanRes = TripInputSchema.safeParse(mockTainanTripPlan.input);
    expect(tainanRes.success).toBe(true);
  });

  it('rejects invalid TripInput payloads (missing fields, wrong types, zero travelers, bad date)', () => {
    const base = mockPenghuTripPlan.input;

    // Missing origin
    const { origin: _removed, ...missingOrigin } = base;
    expect(TripInputSchema.safeParse(missingOrigin).success).toBe(false);

    // Invalid destination literal
    expect(TripInputSchema.safeParse({ ...base, destination: 'tokyo' }).success).toBe(false);

    // Bad startDate format
    expect(TripInputSchema.safeParse({ ...base, startDate: '2026/12/11' }).success).toBe(false);

    // Non-positive or string days
    expect(TripInputSchema.safeParse({ ...base, days: 0 }).success).toBe(false);
    expect(TripInputSchema.safeParse({ ...base, days: '3' }).success).toBe(false);

    // Zero travelers in group
    expect(
      IdentityCountsSchema.safeParse({
        adult: 0,
        collegeStudent: 0,
        senior65Plus: 0,
        child3To12: 0,
        infantUnder3: 0,
        disabledWithCompanion: 0,
        offshoreResident: false,
      }).success
    ).toBe(false);

    // Missing identity key & wrong offshoreResident type
    expect(
      IdentityCountsSchema.safeParse({
        adult: 2,
        offshoreResident: 'no',
      }).success
    ).toBe(false);

    // Empty or unknown preferredTransport
    expect(TripInputSchema.safeParse({ ...base, preferredTransport: [] }).success).toBe(false);
    expect(
      TripInputSchema.safeParse({ ...base, preferredTransport: ['helicopter'] }).success
    ).toBe(false);
  });

  it('validates both mock datasets against TripPlanResultSchema', () => {
    expect(MOCK_TRIP_PLANS).toHaveLength(2);
    expect(TripPlanResultSchema.safeParse(mockPenghuTripPlan).success).toBe(true);
    expect(TripPlanResultSchema.safeParse(mockTainanTripPlan).success).toBe(true);
  });

  it('rejects malformed TripPlanResult payloads', () => {
    // Invalid SeaRiskLevel
    expect(SeaRiskLevelSchema.safeParse('purple').success).toBe(false);

    // closedDays outside 0..6
    const sampleSpot = mockPenghuTripPlan.days[0].stops[0].spot;
    expect(CuratedSpotSchema.safeParse({ ...sampleSpot, closedDays: [7] }).success).toBe(false);

    // Invalid HH:MM time in DayStop
    const sampleStop = mockPenghuTripPlan.days[0].stops[0];
    expect(DayStopSchema.safeParse({ ...sampleStop, startTime: '25:99' }).success).toBe(false);

    // Invalid ReviewWarning code
    expect(
      ReviewWarningSchema.safeParse({
        severity: 'amber',
        code: 'UNKNOWN_CODE',
        message: '警告',
      }).success
    ).toBe(false);

    // Invalid modeUsed
    expect(
      TripPlanResultSchema.safeParse({
        ...mockTainanTripPlan,
        modeUsed: 'magic_mode',
      }).success
    ).toBe(false);

    // Empty perIdentitySplit
    expect(
      BudgetBreakdownSchema.safeParse({
        ...mockTainanTripPlan.budget,
        perIdentitySplit: [],
      }).success
    ).toBe(false);

    // Sub-schema checks for leg, day, identity share
    expect(TransportLegSchema.safeParse(mockTainanTripPlan.days[0].legs[0]).success).toBe(true);
    expect(DayPlanSchema.safeParse(mockTainanTripPlan.days[0]).success).toBe(true);
    expect(
      IdentityCostShareSchema.safeParse(mockTainanTripPlan.budget.perIdentitySplit[0]).success
    ).toBe(true);
  });

  it('satisfies arithmetic reconciliation and scenario invariants for both mock datasets', () => {
    for (const plan of MOCK_TRIP_PLANS) {
      expect(plan.days).toHaveLength(plan.input.days);

      const { budget } = plan;
      expect(budget.originalTotalTwd - budget.discountedTotalTwd).toBe(budget.savedTotalTwd);
      expect(budget.transportTwd + budget.lodgingTwd + budget.activityAndFoodTwd).toBe(
        budget.discountedTotalTwd
      );

      const splitSum = budget.perIdentitySplit.reduce(
        (acc, item) => acc + item.count * item.totalPerPersonTwd,
        0
      );
      expect(splitSum).toBe(budget.discountedTotalTwd);

      // Ensure no spot is scheduled on its closedDays
      for (const day of plan.days) {
        for (const stop of day.stops) {
          expect(stop.spot.closedDays).not.toContain(day.weekday);
        }
      }
    }

    // Penghu-specific assertions: amber sea risk, indoor backup, mixed-identity discounts
    expect(mockPenghuTripPlan.reviewWarnings.some((w) => w.code === 'SEA_RISK' && w.severity === 'amber')).toBe(true);
    expect(
      mockPenghuTripPlan.days.some((d) =>
        d.stops.some((s) => s.backupSpot !== undefined && s.backupSpot.isIndoor)
      )
    ).toBe(true);
    expect(mockPenghuTripPlan.budget.perIdentitySplit.length).toBeGreaterThanOrEqual(4);
    expect(mockPenghuTripPlan.aiSummary?.length ?? 0).toBeLessThanOrEqual(150);

    // Tainan-specific assertions: HSR/TRA/Shuttle + weekdayShiftSavingHint
    const tainanModes = mockTainanTripPlan.days.flatMap((d) => d.legs.map((l) => l.mode));
    expect(tainanModes).toContain('hsr');
    expect(tainanModes).toContain('tra');
    expect(tainanModes).toContain('taiwan_tourist_shuttle');
    expect(mockTainanTripPlan.budget.weekdayShiftSavingHint).toBeDefined();
    expect(mockTainanTripPlan.budget.weekdayShiftSavingHint?.estimatedSaveTwd).toBeGreaterThan(0);
  });

  it('rejects impossible calendar dates, invalid ISO timestamps, and non-HTTP(S) URLs', () => {
    const baseInput = mockPenghuTripPlan.input;
    const baseDay = mockPenghuTripPlan.days[0];
    const baseStop = baseDay.stops[0];
    const baseLeg = mockPenghuTripPlan.days[1].legs[0];

    const impossibleDates = ['2026-02-30', '2025-02-29', '2026-04-31', '2026-13-01', '2026-00-10'];
    for (const badDate of impossibleDates) {
      expect(TripInputSchema.safeParse({ ...baseInput, startDate: badDate }).success).toBe(false);
      expect(DayPlanSchema.safeParse({ ...baseDay, date: badDate }).success).toBe(false);
      expect(
        WeekdayShiftSavingHintSchema.safeParse({
          suggestedStartDate: badDate,
          estimatedSaveTwd: 500,
          reason: '測試平日省錢提示',
        }).success
      ).toBe(false);
    }

    // Valid leap-year date passes
    expect(TripInputSchema.safeParse({ ...baseInput, startDate: '2024-02-29' }).success).toBe(true);

    // Invalid ISO-8601 timestamps are rejected; valid Z and offset timestamps pass
    expect(
      TripPlanResultSchema.safeParse({
        ...mockPenghuTripPlan,
        generatedAt: '2026-02-30T25:99:99Z',
      }).success
    ).toBe(false);
    expect(
      TripPlanResultSchema.safeParse({
        ...mockPenghuTripPlan,
        generatedAt: '2026-11-24T04:00:00+08:00',
      }).success
    ).toBe(true);
    expect(
      TripPlanResultSchema.safeParse({
        ...mockPenghuTripPlan,
        generatedAt: '2026-11-24T04:15:00Z',
      }).success
    ).toBe(true);

    // Dangerous / non-HTTP(S) URL schemes are rejected
    for (const badUrl of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://example.com/a']) {
      expect(DayStopSchema.safeParse({ ...baseStop, googleMapsUrl: badUrl }).success).toBe(false);
      expect(DayPlanSchema.safeParse({ ...baseDay, googleMapsRouteUrl: badUrl }).success).toBe(false);
      expect(TransportLegSchema.safeParse({ ...baseLeg, sourceUrl: badUrl }).success).toBe(false);
    }
  });
});
