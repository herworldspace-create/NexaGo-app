import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { WalletTransactionType, WithdrawalStatus } from '../../common/enums/payment.enum';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrCreateWallet(driverProfileId: string) {
    const existing = await this.prisma.driverWallet.findUnique({ where: { driverProfileId } });
    if (existing) return existing;
    return this.prisma.driverWallet.create({ data: { driverProfileId } });
  }

  /**
   * Credits a driver's wallet for a completed, paid job (a ride or a
   * delivery — `referenceId` is just whatever id the caller wants
   * recorded against the ledger entry). Runs the balance increment and
   * the ledger entry in one DB transaction so the two can never diverge.
   */
  async creditForJob(driverProfileId: string, referenceId: string, amountKobo: number, description: string) {
    if (amountKobo <= 0) return; // nothing to credit (e.g. 100% commission edge case)

    const wallet = await this.getOrCreateWallet(driverProfileId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.driverWallet.update({
        where: { id: wallet.id },
        data: { balanceKobo: { increment: amountKobo } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.CREDIT as any,
          amountKobo,
          referenceId,
          description,
        },
      });
      return updated;
    });
  }

  async getWalletForUser(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }
    const wallet = await this.getOrCreateWallet(profile.id);
    const recentTransactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { ...wallet, recentTransactions };
  }

  /**
   * Atomically debits the wallet using the same conditional-update
   * ("compare-and-swap") pattern as the ride-acceptance race guard in
   * RidesService: `WHERE balanceKobo >= amount` ensures two concurrent
   * withdrawal requests can never both succeed and push the balance
   * negative, without needing external locking.
   */
  async requestWithdrawal(userId: string, amountKobo: number, payoutAccountReference?: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }
    const wallet = await this.getOrCreateWallet(profile.id);

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.driverWallet.updateMany({
        where: { id: wallet.id, balanceKobo: { gte: amountKobo } },
        data: { balanceKobo: { decrement: amountKobo } },
      });

      if (result.count === 0) {
        throw new BadRequestException('Insufficient wallet balance for this withdrawal.');
      }

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.DEBIT as any,
          amountKobo,
          description: 'Withdrawal request',
        },
      });

      return tx.withdrawal.create({
        data: { walletId: wallet.id, amountKobo, payoutAccountReference },
      });
    });
  }

  async listWithdrawals(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }
    const wallet = await this.getOrCreateWallet(profile.id);
    return this.prisma.withdrawal.findMany({
      where: { walletId: wallet.id },
      orderBy: { requestedAt: 'desc' },
    });
  }

  // --- Admin -----------------------------------------------------------------

  async getWalletForDriverProfile(driverProfileId: string) {
    const wallet = await this.getOrCreateWallet(driverProfileId);
    const recentTransactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { ...wallet, recentTransactions };
  }

  async listAllWithdrawals(status?: WithdrawalStatus) {
    return this.prisma.withdrawal.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { requestedAt: 'desc' },
      include: { wallet: { include: { driverProfile: { select: { userId: true, fullName: true } } } } },
    });
  }

  /**
   * Manually resolves a withdrawal request. Real automated payout is not
   * implemented yet (see PaystackPayoutProvider) — this is the interim
   * workflow: an admin transfers the money out-of-band and marks it
   * COMPLETED, or marks it FAILED/REJECTED, in which case the amount
   * that was debited at request time is credited back to the driver's
   * wallet atomically, so a failed payout never leaves the driver
   * permanently short.
   */
  async resolveWithdrawal(withdrawalId: string, outcome: 'COMPLETED' | 'FAILED' | 'REJECTED', failureReason?: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found.');
    }
    if (withdrawal.status !== (WithdrawalStatus.PENDING as any) && withdrawal.status !== (WithdrawalStatus.PROCESSING as any)) {
      throw new BadRequestException('This withdrawal has already been resolved.');
    }

    if (outcome === 'COMPLETED') {
      return this.prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: WithdrawalStatus.COMPLETED as any, processedAt: new Date() },
      });
    }

    // FAILED or REJECTED — reverse the original debit.
    return this.prisma.$transaction(async (tx) => {
      await tx.driverWallet.update({
        where: { id: withdrawal.walletId },
        data: { balanceKobo: { increment: withdrawal.amountKobo } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: withdrawal.walletId,
          type: WalletTransactionType.CREDIT as any,
          amountKobo: withdrawal.amountKobo,
          description: `Withdrawal ${withdrawal.id} reversed (${outcome.toLowerCase()})`,
        },
      });
      return tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: (outcome === 'FAILED' ? WithdrawalStatus.FAILED : WithdrawalStatus.REJECTED) as any,
          processedAt: new Date(),
          failureReason,
        },
      });
    });
  }
}
