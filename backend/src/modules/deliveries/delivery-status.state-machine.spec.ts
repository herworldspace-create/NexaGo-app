import { DeliveryStatus } from '../../common/enums/delivery-status.enum';
import { assertValidDeliveryTransition, InvalidDeliveryStatusTransitionError } from './delivery-status.state-machine';

describe('delivery status state machine', () => {
  it('allows the full happy path exactly as specified', () => {
    const path: DeliveryStatus[] = [
      DeliveryStatus.REQUESTED,
      DeliveryStatus.PACKAGE_PICKUP_PENDING,
      DeliveryStatus.PACKAGE_PICKED_UP,
      DeliveryStatus.IN_TRANSIT,
      DeliveryStatus.DELIVERED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertValidDeliveryTransition(path[i], path[i + 1])).not.toThrow();
    }
  });

  it('rejects skipping straight from REQUESTED to DELIVERED', () => {
    expect(() => assertValidDeliveryTransition(DeliveryStatus.REQUESTED, DeliveryStatus.DELIVERED)).toThrow(
      InvalidDeliveryStatusTransitionError,
    );
  });

  it('rejects any transition out of a terminal state', () => {
    const terminal = [
      DeliveryStatus.DELIVERED,
      DeliveryStatus.CANCELLED_BY_SENDER,
      DeliveryStatus.CANCELLED_BY_DRIVER,
      DeliveryStatus.CANCELLED_SYSTEM,
      DeliveryStatus.NO_DRIVERS_AVAILABLE,
    ];
    for (const status of terminal) {
      expect(() => assertValidDeliveryTransition(status, DeliveryStatus.PACKAGE_PICKUP_PENDING)).toThrow(
        InvalidDeliveryStatusTransitionError,
      );
    }
  });

  it('only allows sender/driver cancellation before pickup is confirmed', () => {
    expect(() =>
      assertValidDeliveryTransition(DeliveryStatus.PACKAGE_PICKUP_PENDING, DeliveryStatus.CANCELLED_BY_SENDER),
    ).not.toThrow();
    expect(() =>
      assertValidDeliveryTransition(DeliveryStatus.PACKAGE_PICKED_UP, DeliveryStatus.CANCELLED_BY_SENDER),
    ).toThrow(InvalidDeliveryStatusTransitionError);
  });
});
