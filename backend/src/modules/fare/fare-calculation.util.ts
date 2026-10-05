/**
 * All monetary values are integer kobo (1 NGN = 100 kobo). We never use
 * floating point for money — every intermediate amount is rounded to the
 * nearest kobo before being summed, so results are exact and reproducible.
 */

export interface FareConfigInput {
  currency: string;
  baseFareKobo: number;
  perKmRateKobo: number;
  perMinuteRateKobo: number;
  serviceFeeFlatKobo: number;
  /** Basis points (10000 = 100%) of the pre-service-fee subtotal. */
  serviceFeePercentBasisPoints: number;
  minimumFareKobo: number;
  /**
   * Platform's cut of the fare, in basis points (10000 = 100%). This is
   * NOT part of what the passenger pays — it's a pass-through so callers
   * (RidesService) can snapshot it onto the Ride for later settlement by
   * PaymentsService. Defaults to 0 for configs created before this field
   * existed.
   */
  platformCommissionBasisPoints?: number;
}

export interface FareCalculationInput {
  config: FareConfigInput;
  distanceKm: number;
  durationMinutes: number;
  /** 10000 = 1.00x (no surge). Defaults to 10000 if omitted. */
  surgeMultiplierBasisPoints?: number;
}

export interface FareBreakdown {
  currency: string;
  baseFareKobo: number;
  distanceFareKobo: number;
  timeFareKobo: number;
  subtotalKobo: number;
  surgeAdjustmentKobo: number;
  serviceFeeKobo: number;
  /** Present only when the minimum fare floor was applied. */
  minimumFareAdjustmentKobo: number;
  totalKobo: number;
  surgeMultiplierBasisPoints: number;
  platformCommissionBasisPoints: number;
}

export class InvalidFareInputError extends Error {}

function roundToNearestKobo(value: number): number {
  return Math.round(value);
}

export function computeFare(input: FareCalculationInput): FareBreakdown {
  const { config, distanceKm, durationMinutes } = input;
  const surgeMultiplierBasisPoints = input.surgeMultiplierBasisPoints ?? 10_000;

  if (distanceKm < 0 || durationMinutes < 0) {
    throw new InvalidFareInputError('Distance and duration must not be negative.');
  }
  if (surgeMultiplierBasisPoints < 10_000) {
    throw new InvalidFareInputError('Surge multiplier cannot discount below 1.00x.');
  }
  if (
    config.baseFareKobo < 0 ||
    config.perKmRateKobo < 0 ||
    config.perMinuteRateKobo < 0 ||
    config.minimumFareKobo < 0
  ) {
    throw new InvalidFareInputError('Fare configuration amounts must not be negative.');
  }

  const baseFareKobo = config.baseFareKobo;
  const distanceFareKobo = roundToNearestKobo(distanceKm * config.perKmRateKobo);
  const timeFareKobo = roundToNearestKobo(durationMinutes * config.perMinuteRateKobo);

  const preSurgeSubtotalKobo = baseFareKobo + distanceFareKobo + timeFareKobo;
  const surgedSubtotalKobo = roundToNearestKobo(
    (preSurgeSubtotalKobo * surgeMultiplierBasisPoints) / 10_000,
  );
  const surgeAdjustmentKobo = surgedSubtotalKobo - preSurgeSubtotalKobo;

  const percentFeeKobo = roundToNearestKobo(
    (surgedSubtotalKobo * config.serviceFeePercentBasisPoints) / 10_000,
  );
  const serviceFeeKobo = config.serviceFeeFlatKobo + percentFeeKobo;

  const preFloorTotalKobo = surgedSubtotalKobo + serviceFeeKobo;
  const totalKobo = Math.max(preFloorTotalKobo, config.minimumFareKobo);
  const minimumFareAdjustmentKobo = totalKobo - preFloorTotalKobo;

  return {
    currency: config.currency,
    baseFareKobo,
    distanceFareKobo,
    timeFareKobo,
    subtotalKobo: preSurgeSubtotalKobo,
    surgeAdjustmentKobo,
    serviceFeeKobo,
    minimumFareAdjustmentKobo,
    totalKobo,
    surgeMultiplierBasisPoints,
    platformCommissionBasisPoints: config.platformCommissionBasisPoints ?? 0,
  };
}

export function koboToNaira(kobo: number): number {
  return Math.round(kobo) / 100;
}
