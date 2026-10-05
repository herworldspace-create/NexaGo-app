export enum RideStatus {
  REQUESTED = 'REQUESTED',
  ACCEPTED = 'ACCEPTED',
  DRIVER_ARRIVED = 'DRIVER_ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED_BY_PASSENGER = 'CANCELLED_BY_PASSENGER',
  CANCELLED_BY_DRIVER = 'CANCELLED_BY_DRIVER',
  CANCELLED_SYSTEM = 'CANCELLED_SYSTEM',
  NO_DRIVERS_AVAILABLE = 'NO_DRIVERS_AVAILABLE',
  EXPIRED = 'EXPIRED',
}

export enum RideCancelledBy {
  PASSENGER = 'PASSENGER',
  DRIVER = 'DRIVER',
  SYSTEM = 'SYSTEM',
}

/** Ride states in which a driver is considered "busy" and must be excluded from matching. */
export const ACTIVE_RIDE_STATUSES: ReadonlySet<RideStatus> = new Set([
  RideStatus.ACCEPTED,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
]);

/** Terminal states — no further transition is allowed out of these. */
export const TERMINAL_RIDE_STATUSES: ReadonlySet<RideStatus> = new Set([
  RideStatus.COMPLETED,
  RideStatus.CANCELLED_BY_PASSENGER,
  RideStatus.CANCELLED_BY_DRIVER,
  RideStatus.CANCELLED_SYSTEM,
  RideStatus.NO_DRIVERS_AVAILABLE,
  RideStatus.EXPIRED,
]);
