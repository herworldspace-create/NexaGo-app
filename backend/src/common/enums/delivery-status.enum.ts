export enum DeliveryStatus {
  REQUESTED = 'REQUESTED',
  PACKAGE_PICKUP_PENDING = 'PACKAGE_PICKUP_PENDING',
  PACKAGE_PICKED_UP = 'PACKAGE_PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED_BY_SENDER = 'CANCELLED_BY_SENDER',
  CANCELLED_BY_DRIVER = 'CANCELLED_BY_DRIVER',
  CANCELLED_SYSTEM = 'CANCELLED_SYSTEM',
  NO_DRIVERS_AVAILABLE = 'NO_DRIVERS_AVAILABLE',
}

export enum DeliveryCancelledBy {
  SENDER = 'SENDER',
  DRIVER = 'DRIVER',
  SYSTEM = 'SYSTEM',
}

export enum PackageCategory {
  DOCUMENT = 'DOCUMENT',
  PARCEL = 'PARCEL',
  FRAGILE = 'FRAGILE',
  FOOD = 'FOOD',
  ELECTRONICS = 'ELECTRONICS',
  OTHER = 'OTHER',
}

export enum WeightTier {
  LIGHT = 'LIGHT',
  MEDIUM = 'MEDIUM',
  HEAVY = 'HEAVY',
}

/** Delivery states in which a driver is "busy" and must be excluded from new dispatch/matching. */
export const ACTIVE_DELIVERY_STATUSES: ReadonlySet<DeliveryStatus> = new Set([
  DeliveryStatus.PACKAGE_PICKUP_PENDING,
  DeliveryStatus.PACKAGE_PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
]);

export const TERMINAL_DELIVERY_STATUSES: ReadonlySet<DeliveryStatus> = new Set([
  DeliveryStatus.DELIVERED,
  DeliveryStatus.CANCELLED_BY_SENDER,
  DeliveryStatus.CANCELLED_BY_DRIVER,
  DeliveryStatus.CANCELLED_SYSTEM,
  DeliveryStatus.NO_DRIVERS_AVAILABLE,
]);
