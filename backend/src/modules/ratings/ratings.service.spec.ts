import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { PrismaService } from '../../config/prisma.service';
import { RideStatus } from '../../common/enums/ride-status.enum';

function buildPrismaMock() {
  return {
    ride: { findUnique: jest.fn() },
    rating: { create: jest.fn(), findMany: jest.fn() },
    driverProfile: { updateMany: jest.fn(), findUnique: jest.fn() },
    passengerProfile: { updateMany: jest.fn(), findUnique: jest.fn() },
  };
}

const completedRide = {
  id: 'ride-1',
  status: RideStatus.COMPLETED,
  passengerUserId: 'passenger-1',
  driverUserId: 'driver-1',
};

describe('RatingsService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: RatingsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new RatingsService(prisma as unknown as PrismaService);
  });

  describe('submitRating', () => {
    it('rejects rating a ride that is not completed', async () => {
      prisma.ride.findUnique.mockResolvedValue({ ...completedRide, status: RideStatus.IN_PROGRESS });
      await expect(service.submitRating('ride-1', 'passenger-1', { score: 5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a rater who was not a party to the ride', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      await expect(service.submitRating('ride-1', 'stranger', { score: 5 })).rejects.toThrow(ForbiddenException);
    });

    it('rates the driver when the passenger submits, and credits the driver profile', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      prisma.rating.create.mockResolvedValue({ id: 'rating-1', ratedUserId: 'driver-1' });

      await service.submitRating('ride-1', 'passenger-1', { score: 4 });

      expect(prisma.rating.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ raterUserId: 'passenger-1', ratedUserId: 'driver-1', score: 4 }) }),
      );
      expect(prisma.driverProfile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'driver-1' },
          data: { ratingsSum: { increment: 4 }, ratingsCount: { increment: 1 } },
        }),
      );
      expect(prisma.passengerProfile.updateMany).not.toHaveBeenCalled();
    });

    it('rates the passenger when the driver submits, and credits the passenger profile', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      prisma.rating.create.mockResolvedValue({ id: 'rating-1', ratedUserId: 'passenger-1' });

      await service.submitRating('ride-1', 'driver-1', { score: 5 });

      expect(prisma.passengerProfile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'passenger-1' },
          data: { ratingsSum: { increment: 5 }, ratingsCount: { increment: 1 } },
        }),
      );
      expect(prisma.driverProfile.updateMany).not.toHaveBeenCalled();
    });

    it('turns a Prisma unique-constraint violation (P2002) into a clean duplicate-rating error', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      prisma.rating.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.submitRating('ride-1', 'passenger-1', { score: 3 })).rejects.toThrow(BadRequestException);
      expect(prisma.driverProfile.updateMany).not.toHaveBeenCalled();
    });

    it('rethrows an unrelated database error unchanged', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      const dbError = new Error('connection lost');
      prisma.rating.create.mockRejectedValue(dbError);

      await expect(service.submitRating('ride-1', 'passenger-1', { score: 3 })).rejects.toThrow('connection lost');
    });

    it('rejects rating a ride with no driver assigned', async () => {
      prisma.ride.findUnique.mockResolvedValue({ ...completedRide, driverUserId: null });
      await expect(service.submitRating('ride-1', 'passenger-1', { score: 5 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getForRide', () => {
    it('rejects a requester who was not a party to the ride', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      await expect(service.getForRide('ride-1', 'stranger')).rejects.toThrow(ForbiddenException);
    });

    it('throws for a nonexistent ride', async () => {
      prisma.ride.findUnique.mockResolvedValue(null);
      await expect(service.getForRide('missing', 'passenger-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProfileRatingSummary', () => {
    it('returns null average with zero ratings', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({ ratingsSum: 0, ratingsCount: 0 });
      const result = await service.getProfileRatingSummary('driver-1', true);
      expect(result).toEqual({ average: null, count: 0 });
    });

    it('computes the average by dividing sum by count (never stores a running average)', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({ ratingsSum: 23, ratingsCount: 5 });
      const result = await service.getProfileRatingSummary('driver-1', true);
      expect(result).toEqual({ average: 4.6, count: 5 });
    });
  });
});
