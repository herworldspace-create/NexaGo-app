import { RideStatus } from '../../common/enums/ride-status.enum';
import { rideStatusNotificationFor, paymentPaidNotification, newRideNearbyNotification } from './notification-content.util';

describe('rideStatusNotificationFor', () => {
  it('tells the passenger when a driver accepts', () => {
    const result = rideStatusNotificationFor('passenger', RideStatus.ACCEPTED);
    expect(result?.type).toBe('ride.accepted');
  });

  it('tells the passenger when the trip completes', () => {
    const result = rideStatusNotificationFor('passenger', RideStatus.COMPLETED);
    expect(result?.body).toMatch(/payment/i);
  });

  it('does not notify the driver about a plain REQUESTED status (that is the dispatch broadcast, handled separately)', () => {
    expect(rideStatusNotificationFor('driver', RideStatus.REQUESTED)).toBeNull();
  });

  it('does not notify the passenger about REQUESTED (they just made the request)', () => {
    expect(rideStatusNotificationFor('passenger', RideStatus.REQUESTED)).toBeNull();
  });

  it('tells the driver when the passenger cancels', () => {
    const result = rideStatusNotificationFor('driver', RideStatus.CANCELLED_BY_PASSENGER);
    expect(result?.type).toBe('ride.cancelled');
  });

  it('does not notify the driver about their own cancellation', () => {
    expect(rideStatusNotificationFor('driver', RideStatus.CANCELLED_BY_DRIVER)).toBeNull();
  });

  it('returns null for an unmapped status', () => {
    expect(rideStatusNotificationFor('passenger', RideStatus.EXPIRED)).toBeNull();
  });
});

describe('paymentPaidNotification', () => {
  it('formats the passenger receipt with the Naira amount', () => {
    const result = paymentPaidNotification('passenger', 1500);
    expect(result.body).toContain('1,500');
    expect(result.type).toBe('payment.paid');
  });

  it('formats the driver payout notice differently from the passenger receipt', () => {
    const driverMsg = paymentPaidNotification('driver', 1200);
    const passengerMsg = paymentPaidNotification('passenger', 1200);
    expect(driverMsg.type).not.toBe(passengerMsg.type);
  });
});

describe('newRideNearbyNotification', () => {
  it('produces a dispatch-type notification', () => {
    expect(newRideNearbyNotification().type).toBe('ride.dispatch');
  });
});
