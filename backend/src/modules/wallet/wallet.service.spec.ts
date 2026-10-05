import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../config/prisma.service';
import { WalletTransactionType } from '../../common/enums/payment.enum';

function buildPrismaMock() {
  const tx = {
    driverWallet: { update: jest.fn(), updateMany: jest.fn() },
    walletTransaction: { create: jest.fn() },
    withdrawal: { create: jest.fn() },
  };
  return {
    driverWallet: { findUnique: jest.fn(), create: jest.fn() },
    driverProfile: { findUnique: jest.fn() },
    walletTransaction: { findMany: jest.fn() },
    withdrawal: { findMany: jest.fn() },
    $transaction: jest.fn((cb: (tx: typeof tx) => unknown) => cb(tx)),
    __tx: tx,
  };
}

describe('WalletService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: WalletService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new WalletService(prisma as unknown as PrismaService);
  });

  describe('creditForJob', () => {
    it('creates a wallet if one does not exist yet, then credits it atomically', async () => {
      prisma.driverWallet.findUnique.mockResolvedValue(null);
      prisma.driverWallet.create.mockResolvedValue({ id: 'wallet-1', driverProfileId: 'driver-1' });
      prisma.__tx.driverWallet.update.mockResolvedValue({ id: 'wallet-1', balanceKobo: 100_000 });

      await service.creditForJob('driver-1', 'ride-1', 100_000, 'Ride earnings');

      expect(prisma.driverWallet.create).toHaveBeenCalledWith({ data: { driverProfileId: 'driver-1' } });
      expect(prisma.__tx.driverWallet.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { balanceKobo: { increment: 100_000 } } }),
      );
      expect(prisma.__tx.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: WalletTransactionType.CREDIT, amountKobo: 100_000, referenceId: 'ride-1' }),
        }),
      );
    });

    it('does nothing for a zero or negative amount (e.g. 100% commission)', async () => {
      await service.creditForJob('driver-1', 'ride-1', 0, 'Ride earnings');
      expect(prisma.driverWallet.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('requestWithdrawal', () => {
    it('debits the wallet and creates a withdrawal record when balance is sufficient', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({ id: 'driver-1' });
      prisma.driverWallet.findUnique.mockResolvedValue({ id: 'wallet-1' });
      prisma.__tx.driverWallet.updateMany.mockResolvedValue({ count: 1 });
      prisma.__tx.withdrawal.create.mockResolvedValue({ id: 'withdrawal-1', amountKobo: 50_000 });

      const result = await service.requestWithdrawal('user-1', 50_000);

      expect(prisma.__tx.driverWallet.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wallet-1', balanceKobo: { gte: 50_000 } },
          data: { balanceKobo: { decrement: 50_000 } },
        }),
      );
      expect(result).toEqual(expect.objectContaining({ id: 'withdrawal-1' }));
    });

    it('rejects (and creates nothing) when the conditional debit affects zero rows (insufficient balance)', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({ id: 'driver-1' });
      prisma.driverWallet.findUnique.mockResolvedValue({ id: 'wallet-1' });
      prisma.__tx.driverWallet.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.requestWithdrawal('user-1', 1_000_000)).rejects.toThrow(BadRequestException);
      expect(prisma.__tx.withdrawal.create).not.toHaveBeenCalled();
      expect(prisma.__tx.walletTransaction.create).not.toHaveBeenCalled();
    });
  });
});
