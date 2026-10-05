import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { UserWalletService } from '../user-wallet/user-wallet.service';
import { VtuOrderStatus, VtuProductType, NetworkProvider } from '../../common/enums/user-wallet.enum';
import { VTU_PROVIDER, VtuProvider } from './interfaces/vtu-provider.interface';
import { PurchaseAirtimeDto } from './dto/purchase-airtime.dto';
import { PurchaseDataDto } from './dto/purchase-data.dto';

@Injectable()
export class VtuService {
  private readonly logger = new Logger(VtuService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: UserWalletService,
    @Inject(VTU_PROVIDER) private readonly vtuProvider: VtuProvider,
  ) {}

  async listDataBundles(network: NetworkProvider) {
    return this.vtuProvider.listDataBundles(network);
  }

  async purchaseAirtime(userId: string, dto: PurchaseAirtimeDto) {
    const order = await this.prisma.vtuOrder.create({
      data: {
        userId,
        type: VtuProductType.AIRTIME as any,
        network: dto.network as any,
        phoneNumber: dto.phoneNumber,
        amountKobo: dto.amountKobo,
        status: VtuOrderStatus.PENDING as any,
      },
    });

    // Debit first (atomic, PIN-checked) — the aggregator call happens
    // only once we know the money is safely set aside, same "reserve
    // before you spend" ordering the rest of this codebase uses.
    await this.walletService.debitForSpend(userId, dto.amountKobo, dto.pin, order.id, `Airtime — ${dto.phoneNumber}`);

    try {
      const result = await this.vtuProvider.purchaseAirtime({
        network: dto.network,
        phoneNumber: dto.phoneNumber,
        amountKobo: dto.amountKobo,
        reference: order.id,
      });
      return this.applyResult(order.id, userId, dto.amountKobo, result);
    } catch (error) {
      return this.handleProviderFailure(order.id, userId, dto.amountKobo, error);
    }
  }

  async purchaseData(userId: string, dto: PurchaseDataDto) {
    const bundles = await this.vtuProvider.listDataBundles(dto.network);
    const bundle = bundles.find((b) => b.code === dto.bundleCode);
    if (!bundle) {
      throw new NotFoundException('Selected data bundle is not available.');
    }

    const order = await this.prisma.vtuOrder.create({
      data: {
        userId,
        type: VtuProductType.DATA as any,
        network: dto.network as any,
        phoneNumber: dto.phoneNumber,
        amountKobo: bundle.priceKobo,
        bundleCode: dto.bundleCode,
        status: VtuOrderStatus.PENDING as any,
      },
    });

    await this.walletService.debitForSpend(
      userId,
      bundle.priceKobo,
      dto.pin,
      order.id,
      `Data — ${bundle.name} — ${dto.phoneNumber}`,
    );

    try {
      const result = await this.vtuProvider.purchaseData({
        network: dto.network,
        phoneNumber: dto.phoneNumber,
        bundleCode: dto.bundleCode,
        reference: order.id,
      });
      return this.applyResult(order.id, userId, bundle.priceKobo, result);
    } catch (error) {
      return this.handleProviderFailure(order.id, userId, bundle.priceKobo, error);
    }
  }

  async listMyOrders(userId: string) {
    return this.prisma.vtuOrder.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  private async applyResult(
    orderId: string,
    userId: string,
    amountKobo: number,
    result: { status: 'successful' | 'failed' | 'pending'; providerReference: string; failureReason?: string },
  ) {
    if (result.status === 'successful') {
      return this.prisma.vtuOrder.update({
        where: { id: orderId },
        data: { status: VtuOrderStatus.SUCCESSFUL as any, providerReference: result.providerReference },
      });
    }

    if (result.status === 'pending') {
      // Aggregator will confirm asynchronously in a real integration
      // (webhook or poll) — left as PENDING rather than guessing an
      // outcome. Not refunded yet; a future reconciliation job should
      // resolve stuck PENDING orders.
      return this.prisma.vtuOrder.update({
        where: { id: orderId },
        data: { providerReference: result.providerReference },
      });
    }

    // Failed — refund the debit immediately so the user isn't charged for nothing.
    await this.walletService.refundSpend(userId, amountKobo, orderId, 'VTU purchase failed — refunded');
    return this.prisma.vtuOrder.update({
      where: { id: orderId },
      data: {
        status: VtuOrderStatus.FAILED as any,
        providerReference: result.providerReference,
        failureReason: result.failureReason ?? 'Provider declined the purchase.',
      },
    });
  }

  private async handleProviderFailure(orderId: string, userId: string, amountKobo: number, error: unknown) {
    this.logger.error(
      `VTU provider call failed for order ${orderId}`,
      error instanceof Error ? error.stack : String(error),
    );
    await this.walletService.refundSpend(userId, amountKobo, orderId, 'VTU purchase failed — refunded');
    await this.prisma.vtuOrder.update({
      where: { id: orderId },
      data: { status: VtuOrderStatus.FAILED as any, failureReason: 'The VTU provider was unavailable.' },
    });
    throw new BadRequestException('Could not complete this purchase right now. Your wallet has been refunded.');
  }
}
