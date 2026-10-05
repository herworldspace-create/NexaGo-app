import { RideStatus } from '../../common/enums/ride-status.enum';
import { assertValidRideTransition, InvalidRideStatusTransitionError } from './ride-status.state-machine';

describe('ride status state machine', () => {
  it('allows the full happy path', () => {
    const path: RideStatus[] = [
      RideStatus.REQUESTED,
      RideStatus.ACCEPTED,
      RideStatus.DRIVER_ARRIVED,
      RideStatus.IN_PROGRESS,
      RideStatus.COMPLETED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertValidRideTransition(path[i], path[i + 1])).not.toThrow();
    }
  });

  it('allows passenger cancellation while requested, accepted, or driver-arrived', () => {
    expect(() =>
      assertValidRideTransition(RideStatus.REQUESTED, RideStatus.CANCELLED_BY_PASSENGER),
    ).not.toThrow();
    expect(() =>
      assertValidRideTransition(RideStatus.ACCEPTED, RideStatus.CANCELLED_BY_PASSENGER),
    ).not.toThrow();
    expect(() =>
      assertValidRideTransition(RideStatus.DRIVER_ARRIVED, RideStatus.CANCELLED_BY_PASSENGER),
    ).not.toThrow();
  });

  it('does not allow passenger/driver cancellation once IN_PROGRESS (only system)', () => {
    expect(() =>
      assertValidRideTransition(RideStatus.IN_PROGRESS, RideStatus.CANCELLED_BY_PASSENGER),
    ).toThrow(InvalidRideStatusTransitionError);
    expect(() =>
      assertValidRideTransition(RideStatus.IN_PROGRESS, RideStatus.CANCELLED_BY_DRIVER),
    ).toThrow(InvalidRideStatusTransitionError);
    expect(() =>
      assertValidRideTransition(RideStatus.IN_PROGRESS, RideStatus.CANCELLED_SYSTEM),
    ).not.toThrow();
  });

  it('rejects skipping straight from REQUESTED to COMPLETED', () => {
    expect(() => assertValidRideTransition(RideStatus.REQUESTED, RideStatus.COMPLETED)).toThrow(
      InvalidRideStatusTransitionError,
    );
  });

  it('rejects any transition out of terminal states', () => {
    const terminal = [
      RideStatus.COMPLETED,
      RideStatus.CANCELLED_BY_PASSENGER,
      RideStatus.CANCELLED_BY_DRIVER,
      RideStatus.CANCELLED_SYSTEM,
      RideStatus.NO_DRIVERS_AVAILABLE,
      RideStatus.EXPIRED,
    ];
    for (const status of terminal) {
      expect(() => assertValidRideTransition(status, RideStatus.ACCEPTED)).toThrow(
        InvalidRideStatusTransitionError,
      );
    }
  });
});
