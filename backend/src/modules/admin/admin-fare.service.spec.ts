import { AdminFareService } from './admin-fare.service';
import { PrismaService } from '../../config/prisma.service';

function buildPrismaMock() {
  const tx = {
    fareConfiguration: { updateMany: jest.fn(), create: jest.fn() },
    surgeSetting: { updateMany: jest.fn(), create: jest.fn() },
  };
  return {
    operatingArea: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    vehicleCategory: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    fareConfiguration: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    surgeSetting: { findMany: jest.fn() },
    $transaction: jest.fn((cb: (tx: typeof tx) => unknown) => cb(tx)),
    __tx: tx,
  };
}

describe('AdminFareService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: AdminFareService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new AdminFareService(prisma as unknown as PrismaService);
  });

  describe('createFareConfiguration', () => {
    it('deactivates any existing active configuration before creating the new one', async () => {
      prisma.operatingArea.findUnique.mockResolvedValue({ id: 'area-1' });
      prisma.vehicleCategory.findUnique.mockResolvedValue({ id: 'cat-1' });
      prisma.__tx.fareConfiguration.create.mockResolvedValue({ id: 'config-2' });

      await service.createFareConfiguration(
        {
          operatingAreaId: 'area-1',
          vehicleCategoryId: 'cat-1',
          baseFareKobo: 20_000,
          perKmRateKobo: 15_000,
          perMinuteRateKobo: 2_000,
          minimumFareKobo: 50_000,
        },
        'admin-1',
      );

      expect(prisma.__tx.fareConfiguration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { operatingAreaId: 'area-1', vehicleCategoryId: 'cat-1', isActive: true },
          data: { isActive: false },
        }),
      );

      const createCallOrder = prisma.__tx.fareConfiguration.create.mock.invocationCallOrder[0];
      const updateManyCallOrder = prisma.__tx.fareConfiguration.updateMany.mock.invocationCallOrder[0];
      expect(updateManyCallOrder).toBeLessThan(createCallOrder);

      expect(prisma.__tx.fareConfiguration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true, createdByAdminId: 'admin-1' }),
        }),
      );
    });

    it('defaults optional fee fields to zero and currency to NGN', async () => {
      prisma.operatingArea.findUnique.mockResolvedValue({ id: 'area-1' });
      prisma.vehicleCategory.findUnique.mockResolvedValue({ id: 'cat-1' });
      prisma.__tx.fareConfiguration.create.mockResolvedValue({ id: 'config-1' });

      await service.createFareConfiguration(
        {
          operatingAreaId: 'area-1',
          vehicleCategoryId: 'cat-1',
          baseFareKobo: 20_000,
          perKmRateKobo: 15_000,
          perMinuteRateKobo: 2_000,
          minimumFareKobo: 50_000,
        },
        'admin-1',
      );

      expect(prisma.__tx.fareConfiguration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currency: 'NGN',
            serviceFeeFlatKobo: 0,
            serviceFeePercentBasisPoints: 0,
            cancellationFeeKobo: 0,
            platformCommissionBasisPoints: 0,
          }),
        }),
      );
    });
  });

  describe('setSurge', () => {
    it('deactivates the previous surge setting for the same (area, category) scope', async () => {
      prisma.operatingArea.findUnique.mockResolvedValue({ id: 'area-1' });
      prisma.__tx.surgeSetting.create.mockResolvedValue({ id: 'surge-2' });

      await service.setSurge(
        { operatingAreaId: 'area-1', multiplierBasisPoints: 15_000, reason: 'Rain' },
        'admin-1',
      );

      expect(prisma.__tx.surgeSetting.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { operatingAreaId: 'area-1', vehicleCategoryId: null, isActive: true },
          data: { isActive: false },
        }),
      );
    });
  });
});
