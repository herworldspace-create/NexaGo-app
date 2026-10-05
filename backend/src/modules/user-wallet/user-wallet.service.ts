import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../config/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { hmacHash, constantTimeEquals } from '../../common/utils/hash.util';
import { UserWalletTransactionType } from '../../common/enums/user-wallet.enum';
import { SetTransactionPinDto } from './dto/set-transaction-pin.dto';

@Injectable()
export class UserWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async getOrCreateWallet(userId: string) {
    const existing = await this.prisma.userWallet.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.userWallet.create({ data: { userId } });
  }

  async getWallet(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const recentTransactions = await this.prisma.userWalletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      balanceKobo: wallet.balanceKobo,
      currency: wallet.currency,
      hasPinSet: Boolean(wallet.transactionPinHash),
      recentTransactions,
    };
  }

  async setTransactionPin(userId: string, dto: SetTransactionPinDto): Promise<void> {
    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.transactionPinHash) {
      if (!dto.currentPin) {
        throw new BadRequestException('Your current PIN is required to change it.');
      }
      const currentHash = hmacHash(dto.currentPin, this.config.jwt.accessSecret);
      if (!constantTimeEquals(currentHash, wallet.transactionPinHash)) {
        throw new ForbiddenException('Current PIN is incorrect.');
      }
    }

    const newHash = hmacHash(dto.newPin, this.config.jwt.accessSecret);
    await this.prisma.userWallet.update({ where: { id: wallet.id }, data: { transactionPinHash: newHash } });
  }

  /** Called by PaymentsService once a wallet-funding payment settles (webhook success). */
  async creditFromFunding(userId: string, amountKobo: number, paymentId: string): Promise<void> {
    const wallet = await this.getOrCreateWallet(userId);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userWallet.update({
        where: { id: wallet.id },
        data: { balanceKobo: { increment: amountKobo } },
      });
      await tx.userWalletTransaction.create({
        data: {
          walletId: wallet.id,
          type: UserWalletTransactionType.FUNDING as any,
          amountKobo,
          balanceAfterKobo: updated.balanceKobo,
          referenceId: paymentId,
          description: 'Wallet funding',
        },
      });
    });

    this.eventEmitter.emit('wallet.funded', { userId, amountKobo });
  }

  /**
   * Atomic P2P transfer. Uses the same conditional-update
   * ("compare-and-swap") pattern as every other balance-mutating
   * operation in this codebase (ride acceptance, driver withdrawals):
   * `WHERE balanceKobo >= amount` on the debit ensures two concurrent
   * transfers/spends can never both succeed and push the sender's
   * balance negative. The debit and credit happen in one DB transaction
   * so a crash between the two is impossible — either both happen or
   * neither does.
   */
  async transfer(fromUserId: string, recipientPhone: string, amountKobo: number, pin: string, note?: string) {
    const senderWallet = await this.getOrCreateWallet(fromUserId);
    await this.assertPinCorrect(senderWallet, pin);

    const recipient = await this.prisma.user.findUnique({ where: { phone: recipientPhone } });
    if (!recipient) {
      throw new NotFoundException('No NEXA account found with that phone number.');
    }
    if (recipient.id === fromUserId) {
      throw new BadRequestException('You cannot transfer money to yourself.');
    }

    const recipientWallet = await this.getOrCreateWallet(recipient.id);

    return this.prisma.$transaction(async (tx) => {
      const debitResult = await tx.userWallet.updateMany({
        where: { id: senderWallet.id, balanceKobo: { gte: amountKobo } },
        data: { balanceKobo: { decrement: amountKobo } },
      });
      if (debitResult.count === 0) {
        throw new BadRequestException('Insufficient wallet balance for this transfer.');
      }

      const debitedWallet = await tx.userWallet.findUniqueOrThrow({ where: { id: senderWallet.id } });
      const senderTxn = await tx.userWalletTransaction.create({
        data: {
          walletId: senderWallet.id,
          type: UserWalletTransactionType.TRANSFER_OUT as any,
          amountKobo,
          balanceAfterKobo: debitedWallet.balanceKobo,
          description: note ?? `Transfer to ${recipientPhone}`,
        },
      });

      const creditedWallet = await tx.userWallet.update({
        where: { id: recipientWallet.id },
        data: { balanceKobo: { increment: amountKobo } },
      });
      await tx.userWalletTransaction.create({
        data: {
          walletId: recipientWallet.id,
          type: UserWalletTransactionType.TRANSFER_IN as any,
          amountKobo,
          balanceAfterKobo: creditedWallet.balanceKobo,
          referenceId: senderTxn.id,
          description: note ?? 'Transfer received',
        },
      });

      this.eventEmitter.emit('wallet.transfer_completed', {
        fromUserId,
        toUserId: recipient.id,
        amountKobo,
      });

      return { debited: amountKobo, newBalanceKobo: debitedWallet.balanceKobo };
    });
  }

  /**
   * Atomic spend debit for VTU purchases — same CAS pattern as transfer,
   * exposed separately so VtuService doesn't need to know transfer
   * semantics (no recipient wallet involved).
   */
  async debitForSpend(userId: string, amountKobo: number, pin: string, referenceId: string, description: string) {
    const wallet = await this.getOrCreateWallet(userId);
    await this.assertPinCorrect(wallet, pin);

    const result = await this.prisma.$transaction(async (tx) => {
      const debitResult = await tx.userWallet.updateMany({
        where: { id: wallet.id, balanceKobo: { gte: amountKobo } },
        data: { balanceKobo: { decrement: amountKobo } },
      });
      if (debitResult.count === 0) {
        throw new BadRequestException('Insufficient wallet balance.');
      }

      const updated = await tx.userWallet.findUniqueOrThrow({ where: { id: wallet.id } });
      await tx.userWalletTransaction.create({
        data: {
          walletId: wallet.id,
          type: UserWalletTransactionType.VTU_PURCHASE as any,
          amountKobo,
          balanceAfterKobo: updated.balanceKobo,
          referenceId,
          description,
        },
      });
      return updated;
    });

    return { newBalanceKobo: result.balanceKobo };
  }

  /** Reverses a debitForSpend when the downstream VTU purchase fails — see VtuService. */
  async refundSpend(userId: string, amountKobo: number, referenceId: string, description: string): Promise<void> {
    const wallet = await this.getOrCreateWallet(userId);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userWallet.update({
        where: { id: wallet.id },
        data: { balanceKobo: { increment: amountKobo } },
      });
      await tx.userWalletTransaction.create({
        data: {
          walletId: wallet.id,
          type: UserWalletTransactionType.VTU_REFUND as any,
          amountKobo,
          balanceAfterKobo: updated.balanceKobo,
          referenceId,
          description,
        },
      });
    });
  }

  private async assertPinCorrect(wallet: { transactionPinHash: string | null }, pin: string): Promise<void> {
    if (!wallet.transactionPinHash) {
      throw new BadRequestException('Set a transaction PIN before spending or transferring from your wallet.');
    }
    const candidateHash = hmacHash(pin, this.config.jwt.accessSecret);
    if (!constantTimeEquals(candidateHash, wallet.transactionPinHash)) {
      throw new ForbiddenException('Incorrect PIN.');
    }
  }
}
