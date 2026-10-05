import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../config/prisma.service';
import { WithdrawalStatus, WalletTransactionType } from '../../common/enums/payment.enum';

function buildPrismaMock() {
  const tx = {
    driverWallet: { update: jest.fn() },
    walletTransaction: { create: jest.fn() },
    withdrawal: { update: jest.fn() },
  };
  return {
    withdrawal: { findUnique: jest.fn(), findMany: jest.fn() },
    driverWallet: { findUnique: jest.fn(), create: jest.fn() },
    walletTransaction: { findMany: jest.fn() },
    $transaction: jest.fn((cb: (tx: typeof tx) => unknown) => cb(tx)),
    __tx: tx,
  };
}

describe('WalletService.resolveWithdrawal (admin manual resolution)', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: WalletService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new WalletService(prisma as unknown as PrismaService);
  });

  it('rejects resolving a withdrawal that is already resolved', async () => {
    prisma.withdrawal.findUnique.mockResolvedValue({ id: 'w1', status: WithdrawalStatus.COMPLETED, walletId: 'wallet-1', amountKobo: 10_000 });
    await expect(service.resolveWithdrawal('w1', 'COMPLETED')).rejects.toThrow(BadRequestException);
  });

  it('marks COMPLETED without touching the wallet balance (money already left, transferred out-of-band)', async () => {
    prisma.withdrawal.findUnique.mockResolvedValue({ id: 'w1', status: WithdrawalStatus.PENDING, walletId: 'wallet-1', amountKobo: 10_000 });

    await service.resolveWithdrawal('w1', 'COMPLETED');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.__tx.driverWallet.update).not.toHaveBeenCalled();
  });

  it('reverses the debit (credits the wallet back) when marking FAILED', async () => {
    prisma.withdrawal.findUnique.mockResolvedValue({ id: 'w1', status: WithdrawalStatus.PENDING, walletId: 'wallet-1', amountKobo: 10_000 });
    prisma.__tx.withdrawal.update.mockResolvedValue({ id: 'w1', status: WithdrawalStatus.FAILED });

    await service.resolveWithdrawal('w1', 'FAILED', 'Bank rejected transfer');

    expect(prisma.__tx.driverWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wallet-1' }, data: { balanceKobo: { increment: 10_000 } } }),
    );
    expect(prisma.__tx.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: WalletTransactionType.CREDIT, amountKobo: 10_000 }) }),
    );
    expect(prisma.__tx.withdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: WithdrawalStatus.FAILED, failureReason: 'Bank rejected transfer' }) }),
    );
  });

  it('reverses the debit when marking REJECTED too', async () => {
    prisma.withdrawal.findUnique.mockResolvedValue({ id: 'w1', status: WithdrawalStatus.PENDING, walletId: 'wallet-1', amountKobo: 5_000 });
    prisma.__tx.withdrawal.update.mockResolvedValue({ id: 'w1', status: WithdrawalStatus.REJECTED });

    await service.resolveWithdrawal('w1', 'REJECTED', 'Suspicious activity');

    expect(prisma.__tx.driverWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balanceKobo: { increment: 5_000 } } }),
    );
  });
});
