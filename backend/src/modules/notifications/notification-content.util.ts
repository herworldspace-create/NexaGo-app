import { RideStatus } from '../../common/enums/ride-status.enum';

export interface NotificationContent {
  type: string;
  title: string;
  body: string;
}

/**
 * What to tell the passenger and/or the driver when a ride's status
 * changes. Returns null for a (audience, status) combination that
 * shouldn't produce a notification (e.g. the driver doesn't need to be
 * told a ride they haven't accepted yet was just requested by someone
 * else — that's the dispatch broadcast, handled separately).
 */
export function rideStatusNotificationFor(
  audience: 'passenger' | 'driver',
  status: RideStatus,
): NotificationContent | null {
  if (audience === 'passenger') {
    switch (status) {
      case RideStatus.ACCEPTED:
        return { type: 'ride.accepted', title: 'Driver on the way', body: 'A driver has accepted your ride request.' };
      case RideStatus.DRIVER_ARRIVED:
        return { type: 'ride.driver_arrived', title: 'Your driver has arrived', body: 'Your driver is waiting at the pickup point.' };
      case RideStatus.IN_PROGRESS:
        return { type: 'ride.started', title: 'Trip started', body: 'Your trip is now in progress.' };
      case RideStatus.COMPLETED:
        return { type: 'ride.completed', title: 'Trip completed', body: 'You have arrived. Please complete payment.' };
      case RideStatus.CANCELLED_BY_DRIVER:
        return { type: 'ride.cancelled', title: 'Ride cancelled', body: 'Your driver cancelled this ride.' };
      case RideStatus.CANCELLED_SYSTEM:
        return { type: 'ride.cancelled', title: 'Ride cancelled', body: 'This ride was cancelled by NEXA support.' };
      case RideStatus.NO_DRIVERS_AVAILABLE:
        return { type: 'ride.no_drivers', title: 'No drivers available', body: 'We could not find a nearby driver. Please try again shortly.' };
      default:
        return null;
    }
  }

  // audience === 'driver'
  switch (status) {
    case RideStatus.CANCELLED_BY_PASSENGER:
      return { type: 'ride.cancelled', title: 'Ride cancelled', body: 'The passenger cancelled this ride.' };
    case RideStatus.CANCELLED_SYSTEM:
      return { type: 'ride.cancelled', title: 'Ride cancelled', body: 'This ride was cancelled by NEXA support.' };
    case RideStatus.COMPLETED:
      return { type: 'ride.completed', title: 'Trip completed', body: 'Trip completed. Earnings will be credited once payment settles.' };
    default:
      return null;
  }
}

export function paymentPaidNotification(recipient: 'passenger' | 'driver', amountNaira: number): NotificationContent {
  if (recipient === 'passenger') {
    return {
      type: 'payment.paid',
      title: 'Payment received',
      body: `Your payment of ₦${amountNaira.toLocaleString('en-NG')} was successful.`,
    };
  }
  return {
    type: 'payment.driver_credited',
    title: 'You got paid',
    body: `₦${amountNaira.toLocaleString('en-NG')} was added to your wallet.`,
  };
}

export function newRideNearbyNotification(): NotificationContent {
  return {
    type: 'ride.dispatch',
    title: 'New ride request nearby',
    body: 'A passenger nearby is requesting a ride. Open the app to view and accept.',
  };
}
