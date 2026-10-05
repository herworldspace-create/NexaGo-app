import { DeliveryStatus } from '../../common/enums/delivery-status.enum';

const ALLOWED_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  [DeliveryStatus.REQUESTED]: [
    DeliveryStatus.PACKAGE_PICKUP_PENDING,
    DeliveryStatus.CANCELLED_BY_SENDER,
    DeliveryStatus.CANCELLED_SYSTEM,
    DeliveryStatus.NO_DRIVERS_AVAILABLE,
  ],
  [DeliveryStatus.PACKAGE_PICKUP_PENDING]: [
    DeliveryStatus.PACKAGE_PICKED_UP,
    DeliveryStatus.CANCELLED_BY_SENDER,
    DeliveryStatus.CANCELLED_BY_DRIVER,
    DeliveryStatus.CANCELLED_SYSTEM,
  ],
  [DeliveryStatus.PACKAGE_PICKED_UP]: [DeliveryStatus.IN_TRANSIT, DeliveryStatus.CANCELLED_SYSTEM],
  [DeliveryStatus.IN_TRANSIT]: [DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED_SYSTEM],
  [DeliveryStatus.DELIVERED]: [],
  [DeliveryStatus.CANCELLED_BY_SENDER]: [],
  [DeliveryStatus.CANCELLED_BY_DRIVER]: [],
  [DeliveryStatus.CANCELLED_SYSTEM]: [],
  [DeliveryStatus.NO_DRIVERS_AVAILABLE]: [],
};

export class InvalidDeliveryStatusTransitionError extends Error {
  constructor(from: DeliveryStatus, to: DeliveryStatus) {
    super(`Cannot transition delivery from ${from} to ${to}.`);
  }
}

export function assertValidDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidDeliveryStatusTransitionError(from, to);
  }
}
