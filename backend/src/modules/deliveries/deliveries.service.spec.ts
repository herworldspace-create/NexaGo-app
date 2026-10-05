import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { PrismaService } from '../../config/prisma.service';
import { FareService } from '../fare/fare.service';
import { DriverVerificationService } from '../driver-verification/driver-verification.service';
import { AppConfigService } from '../../config/app-config.service';
import { SmsProvider } from '../sms/sms-provider.interface';
import { DeliveryStatus } from '../../common/enums/delivery-status.enum';
import { VehicleCategoryType } from '../../common/enums/vehicle-category.enum';
import { hmacHash } from '../../common/utils/hash.util';

function buildPrismaMock() {
  return {
    vehicleCategory: { findUnique: jest.fn() },
    delivery: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    parcel: { findUnique: jest.fn(), update: jest.fn() },
    driverProfile: { findUnique: jest.fn() },
    driverLocation: { findMany: jest.fn() },
    deliveryStatusHistory: { create: jest.fn() },
  };
}

const packageDetails = {
  category: 'PARCEL',
  weightTier: 'LIGHT',
  recipientName: 'Ada Lovelace',
  recipientPhone: '+2348012345678',
};

const createDto = {
  operatingAreaId: 'area-1',
  vehicleCategoryId: 'delivery-cat-1',
  pickupLat: 11.85,
  pickupLng: 13.16,
  dropoffLat: 11.9,
  dropoffLng: 13.2,
  estimatedDistanceKm: 5,
  estimatedDurationMinutes: 15,
  package: packageDetails as any,
};

function buildService(prisma: ReturnType<typeof buildPrismaMock>) {
  const fareService = {
    estimate: jest.fn().mockResolvedValue({ currency: 'NGN', totalKobo: 80_000, platformCommissionBasisPoints: 1_000 }),
  } as unknown as FareService;
  const driverVerification = { assertCanAcceptRides: jest.fn().mockResolvedValue(undefined) } as unknown as DriverVerificationService;
  const config = { jwt: { accessSecret: 'a'.repeat(32) } } as unknown as AppConfigService;
  const eventEmitter = { emit: jest.fn() } as any;
  const smsProvider: jest.Mocked<SmsProvider> = { send: jest.fn().mockResolvedValue(undefined) };

  const service = new DeliveriesService(
    prisma as unknown as PrismaService,
    fareService,
    driverVerification,
    config,
    eventEmitter,
    smsProvider,
  );
  return { service, fareService, driverVerification, smsProvider, eventEmitter };
}

describe('DeliveriesService', () => {
  describe('createDelivery', () => {
    it('rejects a vehicle category that is not a DELIVERY category', async () => {
      const prisma = buildPrismaMock();
      prisma.vehicleCategory.findUnique.mockResolvedValue({ id: 'cat-1', type: VehicleCategoryType.PASSENGER });
      const { service, smsProvider } = buildService(prisma);

      await expect(service.createDelivery('sender-1', createDto)).rejects.toThrow(BadRequestException);
      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('rejects a sender who already has an active delivery', async () => {
      const prisma = buildPrismaMock();
      prisma.vehicleCategory.findUnique.mockResolvedValue({ id: 'cat-1', type: VehicleCategoryType.DELIVERY });
      prisma.delivery.findFirst.mockResolvedValue({ id: 'existing' });
      const { service } = buildService(prisma);

      await expect(service.createDelivery('sender-1', createDto)).rejects.toThrow(BadRequestException);
    });

    it('sends the confirmation PIN to the recipient via SMS, not the in-app notification system', async () => {
      const prisma = buildPrismaMock();
      prisma.vehicleCategory.findUnique.mockResolvedValue({ id: 'cat-1', type: VehicleCategoryType.DELIVERY });
      prisma.delivery.findFirst.mockResolvedValue(null);
      prisma.delivery.create.mockResolvedValue({ id: 'delivery-1' });
      prisma.delivery.findUnique.mockResolvedValue({ senderUserId: 'sender-1', driverUserId: null });

      const { service, smsProvider } = buildService(prisma);
      await service.createDelivery('sender-1', createDto);

      expect(smsProvider.send).toHaveBeenCalledWith(
        packageDetails.recipientPhone,
        expect.stringMatching(/\d{4}/),
      );
    });

    it('never stores the raw PIN — only a hash', async () => {
      const prisma = buildPrismaMock();
      prisma.vehicleCategory.findUnique.mockResolvedValue({ id: 'cat-1', type: VehicleCategoryType.DELIVERY });
      prisma.delivery.findFirst.mockResolvedValue(null);
      prisma.delivery.create.mockResolvedValue({ id: 'delivery-1' });
      prisma.delivery.findUnique.mockResolvedValue({ senderUserId: 'sender-1', driverUserId: null });

      const { service, smsProvider } = buildService(prisma);
      await service.createDelivery('sender-1', createDto);

      const [, message] = smsProvider.send.mock.calls[0];
      const pinMatch = message.match(/\d{4}/)![0];

      const createCallArgs = prisma.delivery.create.mock.calls[0][0];
      const storedHash = createCallArgs.data.parcel.create.confirmationPinHash;
      expect(storedHash).not.toContain(pinMatch);
      expect(storedHash).toBe(hmacHash(pinMatch, 'a'.repeat(32)));
    });
  });

  describe('acceptDelivery — atomic race safety', () => {
    const driverProfile = {
      location: { isOnline: true },
      vehicles: [{ id: 'vehicle-1', isActive: true, vehicleCategoryId: 'cat-1' }],
    };

    it('succeeds when the conditional update affects exactly one row', async () => {
      const prisma = buildPrismaMock();
      prisma.driverProfile.findUnique.mockResolvedValue(driverProfile);
      prisma.delivery.findFirst.mockResolvedValue(null);
      prisma.delivery.findUnique.mockResolvedValue({ id: 'delivery-1', vehicleCategoryId: 'cat-1', status: DeliveryStatus.REQUESTED });
      prisma.delivery.updateMany.mockResolvedValue({ count: 1 });

      const { service } = buildService(prisma);
      const result = await service.acceptDelivery('delivery-1', 'driver-1');

      expect(prisma.delivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'delivery-1', status: DeliveryStatus.REQUESTED } }),
      );
      expect(result).toEqual(expect.objectContaining({ id: 'delivery-1' }));
    });

    it('throws ConflictException when another courier already accepted (0 rows affected)', async () => {
      const prisma = buildPrismaMock();
      prisma.driverProfile.findUnique.mockResolvedValue(driverProfile);
      prisma.delivery.findFirst.mockResolvedValue(null);
      prisma.delivery.findUnique.mockResolvedValue({ id: 'delivery-1', vehicleCategoryId: 'cat-1', status: DeliveryStatus.REQUESTED });
      prisma.delivery.updateMany.mockResolvedValue({ count: 0 });

      const { service } = buildService(prisma);
      await expect(service.acceptDelivery('delivery-1', 'driver-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('completeDelivery — PIN verification', () => {
    const ownedDelivery = {
      id: 'delivery-1',
      driverUserId: 'driver-1',
      status: DeliveryStatus.IN_TRANSIT,
      estimatedFareKobo: 80_000,
      platformCommissionBasisPoints: 1_000,
    };

    it('rejects an incorrect PIN and does not complete the delivery', async () => {
      const prisma = buildPrismaMock();
      prisma.delivery.findUnique.mockResolvedValue(ownedDelivery);
      prisma.parcel.findUnique.mockResolvedValue({ confirmationPinHash: hmacHash('1234', 'a'.repeat(32)) });

      const { service } = buildService(prisma);
      await expect(service.completeDelivery('delivery-1', 'driver-1', '9999')).rejects.toThrow(BadRequestException);
      expect(prisma.delivery.update).not.toHaveBeenCalled();
    });

    it('completes the delivery on a correct PIN (wallet crediting now happens via PaymentsService, not here)', async () => {
      const prisma = buildPrismaMock();
      prisma.delivery.findUnique.mockResolvedValue(ownedDelivery);
      prisma.parcel.findUnique.mockResolvedValue({ confirmationPinHash: hmacHash('4321', 'a'.repeat(32)) });

      const { service } = buildService(prisma);
      await service.completeDelivery('delivery-1', 'driver-1', '4321');

      expect(prisma.delivery.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: DeliveryStatus.DELIVERED }) }),
      );
      expect(prisma.parcel.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ pinVerifiedAt: expect.any(Date) }) }),
      );
    });

    it('rejects a driver who is not assigned to this delivery', async () => {
      const prisma = buildPrismaMock();
      prisma.delivery.findUnique.mockResolvedValue(ownedDelivery);

      const { service } = buildService(prisma);
      await expect(service.completeDelivery('delivery-1', 'someone-else', '4321')).rejects.toThrow(ForbiddenException);
    });
  });
});
