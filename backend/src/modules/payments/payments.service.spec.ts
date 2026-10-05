import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../config/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { PaymentProvider } from './interfaces/payment-provider.interface';
import { RideStatus } from '../../common/enums/ride-status.enum';
import { DeliveryStatus } from '../../common/enums/delivery-status.enum';
import { PaymentMethod, PaymentStatus } from '../../common/enums/payment.enum';

function buildPrismaMock() {
  const tx = {
    payment: { update: jest.fn() },
    transaction: { create: jest.fn() },
  };
  return {
    ride: { findUnique: jest.fn() },
    delivery: { findUnique: jest.fn() },
    payment: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    driverProfile: { findUnique: jest.fn() },
    transaction: { create: jest.fn() },
    $transaction: jest.fn((cb: (tx: typeof tx) => unknown) => cb(tx)),
    __tx: tx,
  };
}

function buildPaymentProviderMock(): jest.Mocked<PaymentProvider> {
  return {
    initialize: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    parseWebhookEvent: jest.fn(),
  };
}

function buildWalletServiceMock(): jest.Mocked<WalletService> {
  return { creditForJob: jest.fn() } as unknown as jest.Mocked<WalletService>;
}

const completedRide = {
  id: 'ride-1',
  passengerUserId: 'passenger-1',
  driverUserId: 'driver-1',
  status: RideStatus.COMPLETED,
  finalFareKobo: 150_000,
  currency: 'NGN',
  platformCommissionBasisPoints: 2_000, // 20%
};

const completedDelivery = {
  id: 'delivery-1',
  senderUserId: 'sender-1',
  driverUserId: 'driver-1',
  status: DeliveryStatus.DELIVERED,
  finalFareKobo: 80_000,
  currency: 'NGN',
  platformCommissionBasisPoints: 1_000, // 10%
};

describe('PaymentsService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let provider: jest.Mocked<PaymentProvider>;
  let wallet: jest.Mocked<WalletService>;
  let service: PaymentsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    provider = buildPaymentProviderMock();
    wallet = buildWalletServiceMock();
    service = new PaymentsService(prisma as unknown as PrismaService, wallet, { emit: jest.fn() } as any, provider);
  });

  describe('initiatePayment — ride', () => {
    it('rejects a ride that is not completed', async () => {
      prisma.ride.findUnique.mockResolvedValue({ ...completedRide, status: RideStatus.IN_PROGRESS });
      await expect(
        service.initiatePayment('ride', 'ride-1', 'passenger-1', { method: PaymentMethod.CASH }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a passenger who does not own the ride', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      await expect(
        service.initiatePayment('ride', 'ride-1', 'someone-else', { method: PaymentMethod.CASH }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects re-initiating a payment that is already PAID', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1', status: PaymentStatus.PAID });
      await expect(
        service.initiatePayment('ride', 'ride-1', 'passenger-1', { method: PaymentMethod.CASH }),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires an email for card payments', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(
        service.initiatePayment('ride', 'ride-1', 'passenger-1', { method: PaymentMethod.CARD }),
      ).rejects.toThrow(BadRequestException);
      expect(provider.initialize).not.toHaveBeenCalled();
    });

    it('creates a PENDING cash payment with no gateway call', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({ id: 'payment-1' });

      const result = await service.initiatePayment('ride', 'ride-1', 'passenger-1', { method: PaymentMethod.CASH });

      expect(provider.initialize).not.toHaveBeenCalled();
      expect(result.authorizationUrl).toBeNull();
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ rideId: 'ride-1' }) }),
      );
    });

    it('marks the payment FAILED if the gateway initialize call throws', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({ id: 'payment-1', amountKobo: 150_000, currency: 'NGN' });
      provider.initialize.mockRejectedValue(new Error('network down'));

      await expect(
        service.initiatePayment('ride', 'ride-1', 'passenger-1', { method: PaymentMethod.CARD, email: 'a@b.com' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.FAILED }) }),
      );
    });
  });

  describe('initiatePayment — delivery', () => {
    it('rejects a delivery that has not been DELIVERED yet', async () => {
      prisma.delivery.findUnique.mockResolvedValue({ ...completedDelivery, status: DeliveryStatus.IN_TRANSIT });
      await expect(
        service.initiatePayment('delivery', 'delivery-1', 'sender-1', { method: PaymentMethod.CASH }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a sender who does not own the delivery', async () => {
      prisma.delivery.findUnique.mockResolvedValue(completedDelivery);
      await expect(
        service.initiatePayment('delivery', 'delivery-1', 'someone-else', { method: PaymentMethod.CASH }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates the payment linked by deliveryId, not rideId', async () => {
      prisma.delivery.findUnique.mockResolvedValue(completedDelivery);
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({ id: 'payment-1' });

      await service.initiatePayment('delivery', 'delivery-1', 'sender-1', { method: PaymentMethod.CASH });

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deliveryId: 'delivery-1' }) }),
      );
      const createArgs = prisma.payment.create.mock.calls[0][0];
      expect(createArgs.data.rideId).toBeUndefined();
    });
  });

  describe('handleWebhook — signature gating', () => {
    it('rejects and does nothing further when the signature is invalid', async () => {
      provider.verifyWebhookSignature.mockReturnValue(false);

      await expect(service.handleWebhook('{}', 'bad-sig')).rejects.toThrow(BadRequestException);
      expect(provider.parseWebhookEvent).not.toHaveBeenCalled();
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook — idempotency and amount safety (ride)', () => {
    beforeEach(() => {
      provider.verifyWebhookSignature.mockReturnValue(true);
    });

    it('does not reprocess a webhook for an already-PAID payment', async () => {
      provider.parseWebhookEvent.mockReturnValue({
        eventType: 'charge.success',
        providerReference: 'ref-1',
        amountKobo: 150_000,
        status: 'success',
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        status: PaymentStatus.PAID,
        amountKobo: 150_000,
        ride: completedRide,
        delivery: null,
      });

      await service.handleWebhook('{}', 'sig');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(wallet.creditForJob).not.toHaveBeenCalled();
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ accepted: false }) }),
      );
    });

    it('rejects and does NOT credit the wallet when the webhook amount does not match the stored payment amount', async () => {
      provider.parseWebhookEvent.mockReturnValue({
        eventType: 'charge.success',
        providerReference: 'ref-1',
        amountKobo: 1, // tampered / mismatched
        status: 'success',
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        status: PaymentStatus.PROCESSING,
        amountKobo: 150_000,
        ride: completedRide,
        delivery: null,
      });

      await service.handleWebhook('{}', 'sig');

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.FAILED }) }),
      );
      expect(wallet.creditForJob).not.toHaveBeenCalled();
    });

    it('marks paid and credits the driver wallet (fare minus commission) on a valid success event', async () => {
      provider.parseWebhookEvent.mockReturnValue({
        eventType: 'charge.success',
        providerReference: 'ref-1',
        amountKobo: 150_000,
        status: 'success',
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        status: PaymentStatus.PROCESSING,
        amountKobo: 150_000,
        ride: completedRide,
        delivery: null,
      });
      prisma.driverProfile.findUnique.mockResolvedValue({ id: 'driver-profile-1' });

      await service.handleWebhook('{}', 'sig');

      expect(prisma.__tx.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.PAID }) }),
      );
      // 150,000 total, 20% commission = 30,000 → driver gets 120,000.
      expect(wallet.creditForJob).toHaveBeenCalledWith('driver-profile-1', 'ride-1', 120_000, expect.any(String));
    });

    it('marks the payment FAILED (no crediting) when the gateway reports failure', async () => {
      provider.parseWebhookEvent.mockReturnValue({
        eventType: 'charge.failed',
        providerReference: 'ref-1',
        amountKobo: 150_000,
        status: 'failed',
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        status: PaymentStatus.PROCESSING,
        amountKobo: 150_000,
        ride: completedRide,
        delivery: null,
      });

      await service.handleWebhook('{}', 'sig');

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.FAILED }) }),
      );
      expect(wallet.creditForJob).not.toHaveBeenCalled();
    });

    it('safely ignores a webhook referencing an unknown payment', async () => {
      provider.parseWebhookEvent.mockReturnValue({
        eventType: 'charge.success',
        providerReference: 'no-such-ref',
        amountKobo: 1,
        status: 'success',
      });
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(service.handleWebhook('{}', 'sig')).resolves.toBeUndefined();
      expect(wallet.creditForJob).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook — delivery payments settle through the same path', () => {
    it('marks paid and credits the driver wallet for a delivery payment', async () => {
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue({
        eventType: 'charge.success',
        providerReference: 'ref-delivery-1',
        amountKobo: 80_000,
        status: 'success',
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        status: PaymentStatus.PROCESSING,
        amountKobo: 80_000,
        ride: null,
        delivery: completedDelivery,
      });
      prisma.driverProfile.findUnique.mockResolvedValue({ id: 'driver-profile-1' });

      await service.handleWebhook('{}', 'sig');

      // 80,000 total, 10% commission = 8,000 → driver gets 72,000.
      expect(wallet.creditForJob).toHaveBeenCalledWith('driver-profile-1', 'delivery-1', 72_000, expect.any(String));
    });
  });

  describe('confirmCashPayment — ride', () => {
    it('rejects a driver not assigned to the ride', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      await expect(service.confirmCashPayment('ride', 'ride-1', 'someone-else')).rejects.toThrow(ForbiddenException);
    });

    it('rejects confirming a non-cash payment', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1', method: PaymentMethod.CARD, status: PaymentStatus.PROCESSING });
      await expect(service.confirmCashPayment('ride', 'ride-1', 'driver-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects confirming an already-paid cash payment', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1', method: PaymentMethod.CASH, status: PaymentStatus.PAID });
      await expect(service.confirmCashPayment('ride', 'ride-1', 'driver-1')).rejects.toThrow(BadRequestException);
    });

    it('marks cash payment PAID and credits the driver wallet', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        method: PaymentMethod.CASH,
        status: PaymentStatus.PENDING,
        amountKobo: 150_000,
      });
      prisma.__tx.payment.update.mockResolvedValue({ id: 'payment-1', status: PaymentStatus.PAID });
      prisma.driverProfile.findUnique.mockResolvedValue({ id: 'driver-profile-1' });

      await service.confirmCashPayment('ride', 'ride-1', 'driver-1');

      expect(wallet.creditForJob).toHaveBeenCalledWith('driver-profile-1', 'ride-1', 120_000, expect.any(String));
    });
  });

  describe('confirmCashPayment — delivery', () => {
    it('rejects a driver not assigned to the delivery', async () => {
      prisma.delivery.findUnique.mockResolvedValue(completedDelivery);
      await expect(service.confirmCashPayment('delivery', 'delivery-1', 'someone-else')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('marks cash payment PAID and credits the driver wallet (fare minus commission)', async () => {
      prisma.delivery.findUnique.mockResolvedValue(completedDelivery);
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        method: PaymentMethod.CASH,
        status: PaymentStatus.PENDING,
        amountKobo: 80_000,
      });
      prisma.__tx.payment.update.mockResolvedValue({ id: 'payment-1', status: PaymentStatus.PAID });
      prisma.driverProfile.findUnique.mockResolvedValue({ id: 'driver-profile-1' });

      await service.confirmCashPayment('delivery', 'delivery-1', 'driver-1');

      expect(wallet.creditForJob).toHaveBeenCalledWith('driver-profile-1', 'delivery-1', 72_000, expect.any(String));
    });
  });

  describe('getPayment — authorization', () => {
    it('allows the assigned driver on a ride', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1' });
      const result = await service.getPayment('ride', 'ride-1', 'driver-1', 'DRIVER' as any);
      expect(result).toEqual({ id: 'payment-1' });
    });

    it('rejects an unrelated user on a ride', async () => {
      prisma.ride.findUnique.mockResolvedValue(completedRide);
      await expect(service.getPayment('ride', 'ride-1', 'stranger', 'PASSENGER' as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows the sender on a delivery', async () => {
      prisma.delivery.findUnique.mockResolvedValue(completedDelivery);
      prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1' });
      const result = await service.getPayment('delivery', 'delivery-1', 'sender-1', 'PASSENGER' as any);
      expect(result).toEqual({ id: 'payment-1' });
    });

    it('rejects an unrelated user on a delivery', async () => {
      prisma.delivery.findUnique.mockResolvedValue(completedDelivery);
      await expect(service.getPayment('delivery', 'delivery-1', 'stranger', 'PASSENGER' as any)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
