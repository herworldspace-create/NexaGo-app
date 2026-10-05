import { NotFoundException } from '@nestjs/common';
import { FareService } from './fare.service';
import { PrismaService } from '../../config/prisma.service';

function buildPrismaMock() {
  return {
    fareConfiguration: { findFirst: jest.fn() },
    surgeSetting: { findFirst: jest.fn() },
  };
}

const baseConfig = {
  currency: 'NGN',
  baseFareKobo: 20_000,
  perKmRateKobo: 15_000,
  perMinuteRateKobo: 2_000,
  serviceFeeFlatKobo: 0,
  serviceFeePercentBasisPoints: 0,
  minimumFareKobo: 0,
};

describe('FareService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: FareService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new FareService(prisma as unknown as PrismaService);
  });

  it('throws NotFoundException when no active fare configuration exists', async () => {
    prisma.fareConfiguration.findFirst.mockResolvedValue(null);

    await expect(
      service.estimate({ operatingAreaId: 'area-1', vehicleCategoryId: 'cat-1', distanceKm: 5, durationMinutes: 5 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('defaults to 1.00x when there is no surge setting at all', async () => {
    prisma.fareConfiguration.findFirst.mockResolvedValue(baseConfig);
    prisma.surgeSetting.findFirst.mockResolvedValue(null);

    const result = await service.estimate({
      operatingAreaId: 'area-1',
      vehicleCategoryId: 'cat-1',
      distanceKm: 10,
      durationMinutes: 10,
    });

    expect(result.surgeMultiplierBasisPoints).toBe(10_000);
  });

  it('prefers a category-specific surge setting over an area-wide one', async () => {
    prisma.fareConfiguration.findFirst.mockResolvedValue(baseConfig);
    prisma.surgeSetting.findFirst
      .mockResolvedValueOnce({ multiplierBasisPoints: 20_000 }) // category-specific lookup
      .mockResolvedValueOnce({ multiplierBasisPoints: 12_000 }); // area-wide lookup (should not win)

    const result = await service.estimate({
      operatingAreaId: 'area-1',
      vehicleCategoryId: 'cat-1',
      distanceKm: 10,
      durationMinutes: 10,
    });

    expect(result.surgeMultiplierBasisPoints).toBe(20_000);
  });

  it('falls back to an area-wide surge setting when no category-specific one exists', async () => {
    prisma.fareConfiguration.findFirst.mockResolvedValue(baseConfig);
    prisma.surgeSetting.findFirst
      .mockResolvedValueOnce(null) // category-specific lookup — none
      .mockResolvedValueOnce({ multiplierBasisPoints: 13_000 }); // area-wide lookup

    const result = await service.estimate({
      operatingAreaId: 'area-1',
      vehicleCategoryId: 'cat-1',
      distanceKm: 10,
      durationMinutes: 10,
    });

    expect(result.surgeMultiplierBasisPoints).toBe(13_000);
  });
});
