import { RideNotificationsListener } from './ride-notifications.listener';
import { RideStatus } from '../../common/enums/ride-status.enum';

function buildListener() {
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const ridesService = { findEligibleDriverUserIdsForDispatch: jest.fn() };
  const listener = new RideNotificationsListener(notifications as any, ridesService as any);
  return { listener, notifications, ridesService };
}

describe('RideNotificationsListener', () => {
  it('on REQUESTED, pushes a dispatch notification to every eligible driver and nobody else', async () => {
    const { listener, notifications, ridesService } = buildListener();
    ridesService.findEligibleDriverUserIdsForDispatch.mockResolvedValue(['driver-1', 'driver-2']);

    await listener.handleRideStatusChanged({
      rideId: 'ride-1',
      status: RideStatus.REQUESTED,
      passengerUserId: 'passenger-1',
      driverUserId: null,
    });

    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(notifications.notify).toHaveBeenCalledWith('driver-1', expect.objectContaining({ type: 'ride.dispatch' }), {
      rideId: 'ride-1',
    });
    expect(notifications.notify).toHaveBeenCalledWith('driver-2', expect.objectContaining({ type: 'ride.dispatch' }), {
      rideId: 'ride-1',
    });
  });

  it('does not crash the process if computing dispatch candidates throws', async () => {
    const { listener, notifications, ridesService } = buildListener();
    ridesService.findEligibleDriverUserIdsForDispatch.mockRejectedValue(new Error('db down'));

    await expect(
      listener.handleRideStatusChanged({ rideId: 'ride-1', status: RideStatus.REQUESTED, passengerUserId: 'p1' }),
    ).resolves.toBeUndefined();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('notifies only the passenger on ACCEPTED (not a dispatch broadcast)', async () => {
    const { listener, notifications, ridesService } = buildListener();

    await listener.handleRideStatusChanged({
      rideId: 'ride-1',
      status: RideStatus.ACCEPTED,
      passengerUserId: 'passenger-1',
      driverUserId: 'driver-1',
    });

    expect(ridesService.findEligibleDriverUserIdsForDispatch).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith('passenger-1', expect.objectContaining({ type: 'ride.accepted' }), {
      rideId: 'ride-1',
    });
  });

  it('notifies both parties on a passenger cancellation (driver told, passenger not — it was their own action)', async () => {
    const { listener, notifications } = buildListener();

    await listener.handleRideStatusChanged({
      rideId: 'ride-1',
      status: RideStatus.CANCELLED_BY_PASSENGER,
      passengerUserId: 'passenger-1',
      driverUserId: 'driver-1',
    });

    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith('driver-1', expect.objectContaining({ type: 'ride.cancelled' }), {
      rideId: 'ride-1',
    });
  });

  it('does nothing when there is no content mapped for a (audience, status) pair', async () => {
    const { listener, notifications } = buildListener();

    await listener.handleRideStatusChanged({
      rideId: 'ride-1',
      status: RideStatus.EXPIRED,
      passengerUserId: 'passenger-1',
      driverUserId: null,
    });

    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
