import { computeFare, InvalidFareInputError, koboToNaira, FareConfigInput } from './fare-calculation.util';

function buildConfig(overrides: Partial<FareConfigInput> = {}): FareConfigInput {
  return {
    currency: 'NGN',
    baseFareKobo: 20_000, // ₦200
    perKmRateKobo: 15_000, // ₦150/km
    perMinuteRateKobo: 2_000, // ₦20/min
    serviceFeeFlatKobo: 0,
    serviceFeePercentBasisPoints: 0,
    minimumFareKobo: 50_000, // ₦500
    ...overrides,
  };
}

describe('computeFare', () => {
  it('computes base + distance + time with no fee, no surge, above minimum', () => {
    const result = computeFare({
      config: buildConfig({ minimumFareKobo: 0 }),
      distanceKm: 10,
      durationMinutes: 20,
    });

    // base 20,000 + distance 10*15,000=150,000 + time 20*2,000=40,000 = 210,000
    expect(result.baseFareKobo).toBe(20_000);
    expect(result.distanceFareKobo).toBe(150_000);
    expect(result.timeFareKobo).toBe(40_000);
    expect(result.subtotalKobo).toBe(210_000);
    expect(result.serviceFeeKobo).toBe(0);
    expect(result.surgeAdjustmentKobo).toBe(0);
    expect(result.totalKobo).toBe(210_000);
  });

  it('applies the minimum fare floor for very short trips', () => {
    const result = computeFare({
      config: buildConfig(),
      distanceKm: 0.5,
      durationMinutes: 1,
    });

    // base 20,000 + distance 7,500 + time 2,000 = 29,500 < minimum 50,000
    expect(result.subtotalKobo + result.serviceFeeKobo).toBeLessThan(50_000);
    expect(result.totalKobo).toBe(50_000);
    expect(result.minimumFareAdjustmentKobo).toBeGreaterThan(0);
  });

  it('does not apply a minimum-fare adjustment when the fare already exceeds it', () => {
    const result = computeFare({
      config: buildConfig(),
      distanceKm: 20,
      durationMinutes: 30,
    });
    expect(result.minimumFareAdjustmentKobo).toBe(0);
  });

  it('applies a flat service fee', () => {
    const result = computeFare({
      config: buildConfig({ serviceFeeFlatKobo: 10_000, minimumFareKobo: 0 }),
      distanceKm: 10,
      durationMinutes: 20,
    });
    expect(result.serviceFeeKobo).toBe(10_000);
    expect(result.totalKobo).toBe(result.subtotalKobo + 10_000);
  });

  it('applies a percentage service fee on the (surged) subtotal', () => {
    const result = computeFare({
      config: buildConfig({ serviceFeePercentBasisPoints: 1_000, minimumFareKobo: 0 }), // 10%
      distanceKm: 10,
      durationMinutes: 20,
    });
    // subtotal 210,000 * 10% = 21,000
    expect(result.serviceFeeKobo).toBe(21_000);
    expect(result.totalKobo).toBe(231_000);
  });

  it('combines flat and percentage service fees', () => {
    const result = computeFare({
      config: buildConfig({
        serviceFeeFlatKobo: 5_000,
        serviceFeePercentBasisPoints: 500, // 5%
        minimumFareKobo: 0,
      }),
      distanceKm: 10,
      durationMinutes: 20,
    });
    // subtotal 210,000 * 5% = 10,500 + flat 5,000 = 15,500
    expect(result.serviceFeeKobo).toBe(15_500);
  });

  it('applies a surge multiplier to the base+distance+time subtotal only, before service fee', () => {
    const result = computeFare({
      config: buildConfig({ minimumFareKobo: 0 }),
      distanceKm: 10,
      durationMinutes: 20,
      surgeMultiplierBasisPoints: 15_000, // 1.5x
    });
    // subtotal 210,000 * 1.5 = 315,000
    expect(result.totalKobo).toBe(315_000);
    expect(result.surgeAdjustmentKobo).toBe(105_000);
  });

  it('treats an explicit 1.00x surge as a no-op', () => {
    const withoutSurge = computeFare({ config: buildConfig({ minimumFareKobo: 0 }), distanceKm: 10, durationMinutes: 20 });
    const withNeutralSurge = computeFare({
      config: buildConfig({ minimumFareKobo: 0 }),
      distanceKm: 10,
      durationMinutes: 20,
      surgeMultiplierBasisPoints: 10_000,
    });
    expect(withNeutralSurge.totalKobo).toBe(withoutSurge.totalKobo);
  });

  it('rejects a surge multiplier below 1.00x (no discounting via surge)', () => {
    expect(() =>
      computeFare({ config: buildConfig(), distanceKm: 5, durationMinutes: 5, surgeMultiplierBasisPoints: 9_000 }),
    ).toThrow(InvalidFareInputError);
  });

  it('rejects negative distance or duration', () => {
    expect(() => computeFare({ config: buildConfig(), distanceKm: -1, durationMinutes: 5 })).toThrow(
      InvalidFareInputError,
    );
    expect(() => computeFare({ config: buildConfig(), distanceKm: 5, durationMinutes: -1 })).toThrow(
      InvalidFareInputError,
    );
  });

  it('rejects a negative fare configuration', () => {
    expect(() =>
      computeFare({ config: buildConfig({ baseFareKobo: -1 }), distanceKm: 5, durationMinutes: 5 }),
    ).toThrow(InvalidFareInputError);
  });

  it('handles a zero-distance, zero-duration trip by falling back to the minimum fare', () => {
    const result = computeFare({ config: buildConfig(), distanceKm: 0, durationMinutes: 0 });
    expect(result.totalKobo).toBe(50_000);
  });

  it('never produces a fractional-kobo amount', () => {
    const result = computeFare({
      config: buildConfig({ perKmRateKobo: 3_333, serviceFeePercentBasisPoints: 777, minimumFareKobo: 0 }),
      distanceKm: 7.777,
      durationMinutes: 13.5,
      surgeMultiplierBasisPoints: 12_345,
    });
    for (const value of Object.values(result)) {
      if (typeof value === 'number') {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('carries the currency through unchanged', () => {
    const result = computeFare({ config: buildConfig({ currency: 'NGN' }), distanceKm: 1, durationMinutes: 1 });
    expect(result.currency).toBe('NGN');
  });

  it('passes platformCommissionBasisPoints through unchanged (it is not part of the passenger total)', () => {
    const withoutFee = computeFare({ config: buildConfig({ minimumFareKobo: 0 }), distanceKm: 10, durationMinutes: 10 });
    const withFee = computeFare({
      config: buildConfig({ minimumFareKobo: 0, platformCommissionBasisPoints: 2_000 }),
      distanceKm: 10,
      durationMinutes: 10,
    });
    expect(withFee.platformCommissionBasisPoints).toBe(2_000);
    // Commission never changes what the passenger pays.
    expect(withFee.totalKobo).toBe(withoutFee.totalKobo);
  });

  it('defaults platformCommissionBasisPoints to 0 when omitted', () => {
    const result = computeFare({ config: buildConfig(), distanceKm: 5, durationMinutes: 5 });
    expect(result.platformCommissionBasisPoints).toBe(0);
  });
});

describe('koboToNaira', () => {
  it('converts kobo to naira', () => {
    expect(koboToNaira(50_000)).toBe(500);
    expect(koboToNaira(150)).toBe(1.5);
  });

  it('rounds fractional kobo before converting', () => {
    expect(koboToNaira(150.6)).toBe(1.51);
  });
});
