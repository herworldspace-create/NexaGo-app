import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { PrismaService } from '../../config/prisma.service';
import { ComplaintCategory } from '../../common/enums/complaint.enum';

function buildPrismaMock() {
  return {
    ride: { findUnique: jest.fn() },
    complaint: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  };
}

describe('ComplaintsService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: ComplaintsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new ComplaintsService(prisma as unknown as PrismaService);
  });

  it('allows a complaint with no rideId (no party check needed)', async () => {
    prisma.complaint.create.mockResolvedValue({ id: 'c1' });
    await service.create('user-1', { category: ComplaintCategory.OTHER, description: 'General app issue here.' });
    expect(prisma.ride.findUnique).not.toHaveBeenCalled();
    expect(prisma.complaint.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ againstUserId: undefined }) }),
    );
  });

  it('rejects a ride-tied complaint from someone who was not a party to that ride', async () => {
    prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', passengerUserId: 'passenger-1', driverUserId: 'driver-1' });
    await expect(
      service.create('stranger', { rideId: 'ride-1', category: ComplaintCategory.SAFETY, description: 'Something happened here.' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws for a nonexistent ride', async () => {
    prisma.ride.findUnique.mockResolvedValue(null);
    await expect(
      service.create('user-1', { rideId: 'missing', category: ComplaintCategory.OTHER, description: 'Something happened here.' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('defaults againstUserId to the driver when the passenger complains', async () => {
    prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', passengerUserId: 'passenger-1', driverUserId: 'driver-1' });
    prisma.complaint.create.mockResolvedValue({ id: 'c1' });

    await service.create('passenger-1', {
      rideId: 'ride-1',
      category: ComplaintCategory.DRIVER_CONDUCT,
      description: 'Driver was rude to me during the trip.',
    });

    expect(prisma.complaint.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ againstUserId: 'driver-1' }) }),
    );
  });

  it('defaults againstUserId to the passenger when the driver complains', async () => {
    prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', passengerUserId: 'passenger-1', driverUserId: 'driver-1' });
    prisma.complaint.create.mockResolvedValue({ id: 'c1' });

    await service.create('driver-1', {
      rideId: 'ride-1',
      category: ComplaintCategory.PASSENGER_CONDUCT,
      description: 'Passenger was disruptive during the trip.',
    });

    expect(prisma.complaint.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ againstUserId: 'passenger-1' }) }),
    );
  });

  it('leaves againstUserId undefined (does not guess) when the ride has no driver assigned yet', async () => {
    prisma.ride.findUnique.mockResolvedValue({ id: 'ride-1', passengerUserId: 'passenger-1', driverUserId: null });
    prisma.complaint.create.mockResolvedValue({ id: 'c1' });

    await service.create('passenger-1', {
      rideId: 'ride-1',
      category: ComplaintCategory.OTHER,
      description: 'Could not find a driver for a while.',
    });

    expect(prisma.complaint.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ againstUserId: undefined }) }),
    );
  });
});
