import { RideStatus } from '../../common/enums/ride-status.enum';

const ALLOWED_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  [RideStatus.REQUESTED]: [
    RideStatus.ACCEPTED,
    RideStatus.CANCELLED_BY_PASSENGER,
    RideStatus.CANCELLED_SYSTEM,
    RideStatus.NO_DRIVERS_AVAILABLE,
    RideStatus.EXPIRED,
  ],
  [RideStatus.ACCEPTED]: [
    RideStatus.DRIVER_ARRIVED,
    RideStatus.CANCELLED_BY_PASSENGER,
    RideStatus.CANCELLED_BY_DRIVER,
    RideStatus.CANCELLED_SYSTEM,
  ],
  [RideStatus.DRIVER_ARRIVED]: [
    RideStatus.IN_PROGRESS,
    RideStatus.CANCELLED_BY_PASSENGER,
    RideStatus.CANCELLED_BY_DRIVER,
    RideStatus.CANCELLED_SYSTEM,
  ],
  [RideStatus.IN_PROGRESS]: [RideStatus.COMPLETED, RideStatus.CANCELLED_SYSTEM],
  [RideStatus.COMPLETED]: [],
  [RideStatus.CANCELLED_BY_PASSENGER]: [],
  [RideStatus.CANCELLED_BY_DRIVER]: [],
  [RideStatus.CANCELLED_SYSTEM]: [],
  [RideStatus.NO_DRIVERS_AVAILABLE]: [],
  [RideStatus.EXPIRED]: [],
};

export class InvalidRideStatusTransitionError extends Error {
  constructor(from: RideStatus, to: RideStatus) {
    super(`Cannot transition ride from ${from} to ${to}.`);
  }
}

export function assertValidRideTransition(from: RideStatus, to: RideStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidRideStatusTransitionError(from, to);
  }
}
