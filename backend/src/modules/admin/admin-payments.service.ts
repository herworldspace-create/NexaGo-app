import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PaymentStatus } from '../../common/enums/payment.enum';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPaymentsQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.method) where.method = query.method;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where: where as any,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          ride: { select: { id: true, passengerUserId: true, driverUserId: true } },
          delivery: { select: { id: true, senderUserId: true, driverUserId: true } },
        },
      }),
      this.prisma.payment.count({ where: where as any }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getDetail(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { transactions: { orderBy: { createdAt: 'desc' } }, ride: true, delivery: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }
    return payment;
  }

  /**
   * Administrative bookkeeping only — marks the payment REFUNDED and logs
   * the reason. This does NOT call Paystack's Refund API or move any
   * money; an actual gateway refund is a genuine unimplemented
   * integration gap here, the same honest boundary as
   * PaystackPayoutProvider in the wallet module. Use this to keep
   * records straight after refunding a passenger manually/out-of-band.
   */
  async markRefunded(paymentId: string, reason: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }
    if (payment.status !== (PaymentStatus.PAID as any)) {
      throw new BadRequestException('Only a paid payment can be marked as refunded.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.REFUNDED as any },
      });
      await tx.transaction.create({
        data: {
          paymentId,
          eventType: 'admin.refund_recorded',
          amountKobo: payment.amountKobo,
          accepted: true,
          note: reason,
        },
      });
      return updated;
    });
  }
}
