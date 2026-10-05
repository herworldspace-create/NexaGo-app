import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RidesService } from './rides.service';
import { PrismaService } from '../../config/prisma.service';
import { FareService } from '../fare/fare.service';
import { DriverVerificationService } from '../driver-verification/driver-verification.service';
import { RideStatus } from '../../common/enums/ride-status.enum';
import { PassengerVerificationStatus } from '../../common/enums/verification-status.enum';

function buildPrismaMock() {
  return {
    passengerProfile: { findUnique: jest.fn() },
    driverProfile: { findUnique: jest.fn() },
    driverLocation: { findMany: jest.fn() },
    ride: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    rideStatusHistory: { create: jest.fn() },
    rideFareRevision: { create: jest.fn(), findMany: jest.fn() },
  };
}

function buildFareServiceMock(): jest.Mocked<FareService> {
  return {
    estimate: jest.fn().mockResolvedValue({
      currency: 'NGN',
      totalKobo: 150_000,
      baseFareKobo: 20_000,
      distanceFareKobo: 100_000,
      timeFareKobo: 20_000,
      subtotalKobo: 140_000,
      surgeAdjustmentKobo: 0,
      serviceFeeKobo: 10_000,
      minimumFareAdjustmentKobo: 0,
      surgeMultiplierBasisPoints: 10_000,
      platformCommissionBasisPoints: 1_500,
    }),
  } as unknown as jest.Mocked<FareService>;
}

function buildDriverVerificationMock(): jest.Mocked<DriverVerificationService> {
  return {
    assertCanAcceptRides: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<DriverVerificationService>;
}

function buildEventEmitterMock() {
  return { emit: jest.fn() };
}

const createRideDto = {
  operatingAreaId: 'area-1',
  vehicleCategoryId: 'cat-1',
  pickupLat: 11.85,
  pickupLng: 13.16,
  destinationLat: 11.9,
  destinationLng: 13.2,
  estimatedDistanceKm: 5,
  estimatedDurationMinutes: 15,
};

describe('RidesService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let fareService: jest.Mocked<FareService>;
  let driverVerification: jest.Mocked<DriverVerificationService>;
  let eventEmitter: ReturnType<typeof buildEventEmitterMock>;
  let service: RidesService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    fareService = buildFareServiceMock();
    driverVerification = buildDriverVerificationMock();
    eventEmitter = buildEventEmitterMock();
    service = new RidesService(
      prisma as unknown as PrismaService,
      fareService,
      driverVerification,
      eventEmitter as any,
    );
  });

  describe('createRide', () => {
    it('rejects a passenger who has not completed identity verification', async () => {
      prisma.passengerProfile.findUnique.mockResolvedValue({
        verificationStatus: PassengerVerificationStatus.PHONE_VERIFIED,
      });

      await expect(service.createRide('passenger-1', createRideDto)).rejects.toThrow(BadRequestException);
      expect(fareService.estimate).not.toHaveBeenCalled();
    });

    it('rejects a passenger who already has an active ride', async () => {
      prisma.passengerProfile.findUnique.mockResolvedValue({
        verificationStatus: PassengerVerificationStatus.IDENTITY_VERIFIED,
      });
      prisma.ride.findFirst.mockResolvedValue({ id: 'existing-ride' });

      await expect(service.createRide('passenger-1', createRideDto)).rejects.toThrow(BadRequestException);
      expect(fareService.estimate).not.toHaveBeenCalled();
    });

    it('creates a ride with a fare snapshot and writes a REQUESTED history entry', async () => {
      prisma.passengerProfile.findUnique.mockResolvedValue({
        verificationStatus: PassengerVerificationStatus.IDENTITY_VERIFIED,
      });
      prisma.ride.findFirst.mockResolvedValue(null);
      prisma.ride.create.mockResolvedValue({ id: 'ride-1' });
      prisma.ride.findUnique.mockResolvedValue({ passengerUserId: 'passenger-1', driverUserId: null });

      const result = await service.createRide('passenger-1', createRideDto);

      expect(fareService.estimate).toHaveBeenCalledWith(
        expect.objectContaining({ operatingAreaId: 'area-1', vehicleCategoryId: 'cat-1' }),
      );
      expect(prisma.ride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            estimatedFareKobo: 150_000,
            currency: 'NGN',
            platformCommissionBasisPoints: 1_500,
          }),
        }),
      );
      expect(prisma.rideStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: RideStatus.REQUESTED }) }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ride.status_changed',
        expect.objectContaining({ rideId: 'ride-1', status: RideStatus.REQUESTED, passengerUserId: 'passenger-1' }),
      );
      expect(result).toEqual({ id: 'ride-1' });
    });
  });

  describe('acceptRide — atomic race safety', () => {
    const driverProfile = {
      location: { isOnline: true },
      vehicles: [{ id: 'vehicle-1', isActive: true, vehicleCategoryId: 'cat-1' }],
    };

    it('succeeds when the conditional update affects exactly one row', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue(driverProfile);
      prisma.ride.findFirst.mockResolvedValue(null); // not already busy
      prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', vehicleCategoryId: 'cat-1', status: RideStatus.REQUESTED });
      prisma.ride.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.acceptRide('ride-1', 'driver-1');

      expect(prisma.ride.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ride-1', status: RideStatus.REQUESTED } }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ride.status_changed',
        expect.objectContaining({ rideId: 'ride-1', status: RideStatus.ACCEPTED }),
      );
      expect(result).toEqual(expect.objectContaining({ id: 'ride-1' }));
    });

    it('throws ConflictException when another driver already accepted (0 rows affected)', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue(driverProfile);
      prisma.ride.findFirst.mockResolvedValue(null);
      prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', vehicleCategoryId: 'cat-1', status: RideStatus.REQUESTED });
      prisma.ride.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.acceptRide('ride-1', 'driver-1')).rejects.toThrow(ConflictException);
    });

    it('rejects if the driver is not online', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({ location: { isOnline: false }, vehicles: [] });

      await expect(service.acceptRide('ride-1', 'driver-1')).rejects.toThrow(BadRequestException);
      expect(prisma.ride.updateMany).not.toHaveBeenCalled();
    });

    it('rejects if the driver already has an active ride', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue(driverProfile);
      prisma.ride.findFirst.mockResolvedValue({ id: 'other-active-ride' });

      await expect(service.acceptRide('ride-1', 'driver-1')).rejects.toThrow(BadRequestException);
      expect(prisma.ride.updateMany).not.toHaveBeenCalled();
    });

    it('rejects if the driver has no active vehicle in the matching category', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({
        location: { isOnline: true },
        vehicles: [{ id: 'v1', isActive: true, vehicleCategoryId: 'different-category' }],
      });
      prisma.ride.findFirst.mockResolvedValue(null);
      prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', vehicleCategoryId: 'cat-1', status: RideStatus.REQUESTED });

      await expect(service.acceptRide('ride-1', 'driver-1')).rejects.toThrow(BadRequestException);
      expect(prisma.ride.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('listAvailableForDriver — eligibility exclusions', () => {
    it('rejects (via driver verification) an ineligible driver before any ride lookup', async () => {
      driverVerification.assertCanAcceptRides.mockRejectedValue(new BadRequestException('not eligible'));

      await expect(service.listAvailableForDriver('driver-1')).rejects.toThrow(BadRequestException);
      expect(prisma.ride.findMany).not.toHaveBeenCalled();
    });

    it('rejects an offline driver', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({ location: { isOnline: false }, vehicles: [] });

      await expect(service.listAvailableForDriver('driver-1')).rejects.toThrow(BadRequestException);
    });

    it('returns an empty list for a driver who already has an active ride', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({
        location: { isOnline: true, latitude: 11.85, longitude: 13.16 },
        vehicles: [{ isActive: true, vehicleCategoryId: 'cat-1' }],
      });
      prisma.ride.findFirst.mockResolvedValue({ id: 'busy-ride' });

      const result = await service.listAvailableForDriver('driver-1');
      expect(result).toEqual([]);
      expect(prisma.ride.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty list for a driver with no categorized active vehicle', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({
        location: { isOnline: true, latitude: 11.85, longitude: 13.16 },
        vehicles: [{ isActive: true, vehicleCategoryId: null }],
      });
      prisma.ride.findFirst.mockResolvedValue(null);

      const result = await service.listAvailableForDriver('driver-1');
      expect(result).toEqual([]);
    });

    it('excludes rides outside the matching radius even if the bounding box passed', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({
        location: { isOnline: true, latitude: 11.85, longitude: 13.16 },
        vehicles: [{ isActive: true, vehicleCategoryId: 'cat-1' }],
      });
      prisma.ride.findFirst.mockResolvedValue(null);
      // A ride far enough that it could slip through a loose bounding box
      // but must be excluded by the precise haversine check.
      prisma.ride.findMany.mockResolvedValue([
        { id: 'far-ride', pickupLat: 12.5, pickupLng: 13.9, requestedAt: new Date() },
      ]);

      const result = await service.listAvailableForDriver('driver-1');
      expect(result).toEqual([]);
    });

    it('ranks nearer rides before farther ones', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({
        location: { isOnline: true, latitude: 11.85, longitude: 13.16 },
        vehicles: [{ isActive: true, vehicleCategoryId: 'cat-1' }],
      });
      prisma.ride.findFirst.mockResolvedValue(null);
      prisma.ride.findMany.mockResolvedValue([
        { id: 'far', pickupLat: 11.89, pickupLng: 13.19, requestedAt: new Date() },
        { id: 'near', pickupLat: 11.851, pickupLng: 13.161, requestedAt: new Date() },
      ]);

      const result = await service.listAvailableForDriver('driver-1');
      expect(result.map((r: any) => r.id)).toEqual(['near', 'far']);
    });
  });

  describe('cancelByPassenger', () => {
    it('rejects cancelling a ride that belongs to someone else', async () => {
      prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', passengerUserId: 'someone-else', status: RideStatus.REQUESTED });

      await expect(service.cancelByPassenger('ride-1', 'passenger-1')).rejects.toThrow(ForbiddenException);
    });

    it('rejects cancelling a ride that no longer exists', async () => {
      prisma.ride.findUnique.mockResolvedValue(null);
      await expect(service.cancelByPassenger('missing', 'passenger-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findEligibleDriverUserIdsForDispatch', () => {
    const rideForDispatch = {
      id: 'ride-1',
      pickupLat: 11.85,
      pickupLng: 13.16,
      vehicleCategoryId: 'cat-1',
    };

    beforeEach(() => {
      prisma.ride.findUnique.mockResolvedValue(rideForDispatch);
      prisma.ride.findMany.mockResolvedValue([]); // no busy drivers by default
    });

    it('excludes a driver whose profile is not ACTIVE', async () => {
      prisma.driverLocation.findMany.mockResolvedValue([
        {
          latitude: 11.851,
          longitude: 13.161,
          driverProfile: {
            userId: 'driver-1',
            verificationStatus: 'SUSPENDED',
            vehicles: [{ isActive: true, vehicleCategoryId: 'cat-1' }],
          },
        },
      ]);

      const result = await service.findEligibleDriverUserIdsForDispatch('ride-1');
      expect(result).toEqual([]);
    });

    it('excludes a driver already on an active ride', async () => {
      prisma.driverLocation.findMany.mockResolvedValue([
        {
          latitude: 11.851,
          longitude: 13.161,
          driverProfile: {
            userId: 'driver-1',
            verificationStatus: 'ACTIVE',
            vehicles: [{ isActive: true, vehicleCategoryId: 'cat-1' }],
          },
        },
      ]);
      prisma.ride.findMany.mockResolvedValue([{ driverUserId: 'driver-1' }]);

      const result = await service.findEligibleDriverUserIdsForDispatch('ride-1');
      expect(result).toEqual([]);
    });

    it('excludes a driver with no vehicle in the matching category', async () => {
      prisma.driverLocation.findMany.mockResolvedValue([
        {
          latitude: 11.851,
          longitude: 13.161,
          driverProfile: {
            userId: 'driver-1',
            verificationStatus: 'ACTIVE',
            vehicles: [{ isActive: true, vehicleCategoryId: 'different-category' }],
          },
        },
      ]);

      const result = await service.findEligibleDriverUserIdsForDispatch('ride-1');
      expect(result).toEqual([]);
    });

    it('includes an eligible online driver within range', async () => {
      prisma.driverLocation.findMany.mockResolvedValue([
        {
          latitude: 11.851,
          longitude: 13.161,
          driverProfile: {
            userId: 'driver-1',
            verificationStatus: 'ACTIVE',
            vehicles: [{ isActive: true, vehicleCategoryId: 'cat-1' }],
          },
        },
      ]);

      const result = await service.findEligibleDriverUserIdsForDispatch('ride-1');
      expect(result).toEqual(['driver-1']);
    });
  });

  describe('updateDestination (the sole path a locked-in fare may change)', () => {
    const activeRide = {
      id: 'ride-1',
      passengerUserId: 'passenger-1',
      driverUserId: 'driver-1',
      status: RideStatus.IN_PROGRESS,
      operatingAreaId: 'area-1',
      vehicleCategoryId: 'cat-1',
      destinationLat: 11.9,
      destinationLng: 13.2,
      estimatedFareKobo: 150_000,
    };

    it('rejects a requester who does not own the ride', async () => {
      prisma.ride.findUnique.mockResolvedValue(activeRide);
      await expect(
        service.updateDestination('ride-1', 'stranger', {
          destinationLat: 12.0,
          destinationLng: 13.3,
          estimatedDistanceKm: 8,
          estimatedDurationMinutes: 20,
        }),
      ).rejects.toThrow();
    });

    it('rejects updating the destination of an already-terminal ride', async () => {
      prisma.ride.findUnique.mockResolvedValue({ ...activeRide, status: RideStatus.COMPLETED });
      await expect(
        service.updateDestination('ride-1', 'passenger-1', {
          destinationLat: 12.0,
          destinationLng: 13.3,
          estimatedDistanceKm: 8,
          estimatedDurationMinutes: 20,
        }),
      ).rejects.toThrow();
      expect(prisma.rideFareRevision.create).not.toHaveBeenCalled();
    });

    it('recalculates the fare, records a revision, and updates the ride in one go', async () => {
      prisma.ride.findUnique.mockResolvedValue(activeRide);
      prisma.ride.update.mockResolvedValue({ ...activeRide, estimatedFareKobo: 220_000 });

      await service.updateDestination('ride-1', 'passenger-1', {
        destinationLat: 12.0,
        destinationLng: 13.3,
        estimatedDistanceKm: 8,
        estimatedDurationMinutes: 20,
        reason: 'Changed plans',
      });

      expect(prisma.rideFareRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            previousEstimatedFareKobo: 150_000,
            newEstimatedFareKobo: 150_000, // mocked fareService always returns 150,000
            revisedByUserId: 'passenger-1',
            reason: 'Changed plans',
          }),
        }),
      );
      expect(prisma.ride.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ride-1' },
          data: expect.objectContaining({ destinationLat: 12.0, destinationLng: 13.3 }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('ride.fare_updated', expect.objectContaining({ rideId: 'ride-1' }));
    });
  });

  describe('cancelBySystem (admin/support cancellation)', () => {
    it('allows cancelling a ride that is IN_PROGRESS (unlike passenger/driver cancellation)', async () => {
      prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', status: RideStatus.IN_PROGRESS, passengerUserId: 'p1', driverUserId: 'd1' });

      const result = await service.cancelBySystem('ride-1', 'admin-1', 'Emergency dispatch override');

      expect(prisma.ride.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: RideStatus.CANCELLED_SYSTEM, cancelledBy: 'SYSTEM' }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('rejects cancelling a ride already in a terminal state', async () => {
      prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', status: RideStatus.COMPLETED, passengerUserId: 'p1', driverUserId: 'd1' });

      await expect(service.cancelBySystem('ride-1', 'admin-1')).rejects.toThrow();
      expect(prisma.ride.update).not.toHaveBeenCalled();
    });
  });

  describe('getRide — authorization', () => {
    it('allows the passenger who owns the ride', async () => {
      prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', passengerUserId: 'passenger-1', driverUserId: null });
      const result = await service.getRide('ride-1', 'passenger-1', 'PASSENGER' as any);
      expect(result).toBeDefined();
    });

    it('rejects an unrelated passenger', async () => {
      prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', passengerUserId: 'someone-else', driverUserId: null });
      await expect(service.getRide('ride-1', 'passenger-1', 'PASSENGER' as any)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
