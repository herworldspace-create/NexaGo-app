import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../config/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { UserWalletService } from '../user-wallet/user-wallet.service';
import { Role } from '../../common/enums/role.enum';
import { RideStatus } from '../../common/enums/ride-status.enum';
import { DeliveryStatus } from '../../common/enums/delivery-status.enum';
import { PaymentMethod, PaymentStatus } from '../../common/enums/payment.enum';
import { PAYMENT_PROVIDER, PaymentProvider, WebhookEvent } from './interfaces/payment-provider.interface';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

export type PayableJobType = 'ride' | 'delivery';

/**
 * Normalized shape both Ride and Delivery are mapped into, so the rest
 * of this service (initiation, webhook settlement, cash confirmation,
 * crediting) is written once against one shape instead of twice against
 * two nearly-identical ones.
 */
interface PayableJob {
  type: PayableJobType;
  id: string;
  payerUserId: string;
  driverUserId: string | null;
  finalFareKobo: number | null;
  currency: string;
  platformCommissionBasisPoints: number;
  isCompleted: boolean;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly userWalletService: UserWalletService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  /**
   * A third settlement destination alongside rides/deliveries: the user
   * is simply topping up their general wallet, not paying for a
   * completed job. No "isCompleted" check applies — funding a wallet
   * doesn't require any prior entity to exist. Always routed through
   * the gateway (a wallet top-up isn't a cash transaction).
   */
  async initiateWalletFunding(userId: string, amountKobo: number, email: string) {
    const payment = await this.prisma.payment.create({
      data: {
        walletFundingUserId: userId,
        method: PaymentMethod.CARD as any,
        status: PaymentStatus.PROCESSING as any,
        amountKobo,
        currency: 'NGN',
        provider: 'paystack',
      },
    });

    try {
      const result = await this.paymentProvider.initialize({
        reference: payment.id,
        amountKobo: payment.amountKobo,
        currency: payment.currency,
        customerEmail: email,
        metadata: { walletFundingUserId: userId },
      });

      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerReference: result.providerReference },
      });

      return { payment: updated, authorizationUrl: result.authorizationUrl };
    } catch (error) {
      this.logger.error(
        `Payment provider initialize failed for wallet funding payment ${payment.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED as any, failureReason: 'Payment provider was unavailable.' },
      });
      throw new BadRequestException('Could not start wallet funding right now. Please try again shortly.');
    }
  }

  async initiatePayment(jobType: PayableJobType, jobId: string, payerUserId: string, dto: InitiatePaymentDto) {
    const job = await this.getRequiredPayableJob(jobType, jobId);
    if (job.payerUserId !== payerUserId) {
      throw new ForbiddenException(`This ${jobType} does not belong to you.`);
    }
    if (!job.isCompleted || job.finalFareKobo == null) {
      throw new BadRequestException(`This ${jobType} must be completed before payment can be made.`);
    }

    const existing = await this.findPaymentForJob(jobType, jobId);
    if (existing && existing.status !== (PaymentStatus.FAILED as any)) {
      throw new BadRequestException(
        existing.status === (PaymentStatus.PAID as any)
          ? `This ${jobType} has already been paid for.`
          : `A payment for this ${jobType} is already in progress.`,
      );
    }

    const jobLink = jobType === 'ride' ? { rideId: jobId } : { deliveryId: jobId };

    if (dto.method === PaymentMethod.CASH) {
      const payment = existing
        ? await this.prisma.payment.update({
            where: { id: existing.id },
            data: {
              method: PaymentMethod.CASH as any,
              status: PaymentStatus.PENDING as any,
              provider: 'cash',
              providerReference: null,
              failureReason: null,
            },
          })
        : await this.prisma.payment.create({
            data: {
              ...jobLink,
              method: PaymentMethod.CASH as any,
              status: PaymentStatus.PENDING as any,
              amountKobo: job.finalFareKobo,
              currency: job.currency,
              provider: 'cash',
            },
          });
      return { payment, authorizationUrl: null };
    }

    // CARD / BANK_TRANSFER — routed through the configured gateway (Paystack).
    if (!dto.email) {
      throw new BadRequestException('An email address is required for card or bank transfer payments.');
    }

    const payment = existing
      ? await this.prisma.payment.update({
          where: { id: existing.id },
          data: { method: dto.method as any, status: PaymentStatus.PROCESSING as any, failureReason: null },
        })
      : await this.prisma.payment.create({
          data: {
            ...jobLink,
            method: dto.method as any,
            status: PaymentStatus.PROCESSING as any,
            amountKobo: job.finalFareKobo,
            currency: job.currency,
            provider: 'paystack',
          },
        });

    try {
      const result = await this.paymentProvider.initialize({
        reference: payment.id,
        amountKobo: payment.amountKobo,
        currency: payment.currency,
        customerEmail: dto.email,
        metadata: { [jobType === 'ride' ? 'rideId' : 'deliveryId']: jobId },
      });

      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerReference: result.providerReference },
      });

      return { payment: updated, authorizationUrl: result.authorizationUrl };
    } catch (error) {
      this.logger.error(
        `Payment provider initialize failed for payment ${payment.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED as any, failureReason: 'Payment provider was unavailable.' },
      });
      throw new BadRequestException('Could not start the payment right now. Please try again shortly.');
    }
  }

  /**
   * The ONLY path by which a CARD/BANK_TRANSFER payment can be marked
   * PAID, for either a ride or a delivery. `rawBody` and
   * `signatureHeader` come straight from the HTTP layer — signature
   * verification happens before anything else runs, and the amount is
   * checked against what we actually charged before any wallet
   * crediting occurs. Idempotent: a replayed webhook for an
   * already-PAID payment is a safe no-op.
   */
  async handleWebhook(rawBody: string, signatureHeader: string | undefined): Promise<void> {
    if (!this.paymentProvider.verifyWebhookSignature(rawBody, signatureHeader)) {
      this.logger.warn('Rejected a webhook with an invalid or missing signature.');
      throw new BadRequestException('Invalid signature.');
    }

    let event: WebhookEvent;
    try {
      event = this.paymentProvider.parseWebhookEvent(rawBody);
    } catch (error) {
      this.logger.warn(`Failed to parse webhook body: ${error instanceof Error ? error.message : String(error)}`);
      return; // Acknowledge receipt; nothing we can safely act on.
    }

    if (!event.providerReference) {
      this.logger.warn('Webhook event had no provider reference; ignoring.');
      return;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { providerReference: event.providerReference },
      include: { ride: true, delivery: true },
    });

    if (!payment) {
      this.logger.warn(`Webhook referenced an unknown payment reference: ${event.providerReference}`);
      return;
    }

    if (payment.status === (PaymentStatus.PAID as any)) {
      await this.recordTransaction(payment.id, event, false, 'Duplicate webhook — payment already settled.');
      return;
    }

    if (event.amountKobo !== payment.amountKobo) {
      this.logger.error(
        `Amount mismatch on payment ${payment.id}: expected ${payment.amountKobo}, webhook reported ${event.amountKobo}.`,
      );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED as any, failureReason: 'Amount mismatch with payment provider.' },
      });
      await this.recordTransaction(payment.id, event, false, 'Rejected — amount mismatch.');
      return;
    }

    if (event.status === 'success') {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.PAID as any, paidAt: new Date() },
        });
        await tx.transaction.create({
          data: {
            paymentId: payment.id,
            eventType: event.eventType,
            amountKobo: event.amountKobo,
            providerReference: event.providerReference,
            accepted: true,
          },
        });
      });

      const job = payment.ride
        ? this.mapRideToJob(payment.ride)
        : payment.delivery
          ? this.mapDeliveryToJob(payment.delivery)
          : null;
      if (job) {
        await this.creditDriverForJob(job, payment.amountKobo);
      } else if (payment.walletFundingUserId) {
        await this.userWalletService.creditFromFunding(payment.walletFundingUserId, payment.amountKobo, payment.id);
        this.eventEmitter.emit('wallet.funding_settled', {
          userId: payment.walletFundingUserId,
          amountKobo: payment.amountKobo,
        });
      }
    } else {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED as any, failureReason: 'Payment provider reported failure.' },
      });
      await this.recordTransaction(payment.id, event, true, 'Gateway reported failure.');
    }
  }

  /**
   * Cash is fundamentally a different trust model from card/bank: there is
   * no gateway to verify against, so this is a driver attestation, not a
   * client-supplied "payment status" in the sense the spec warns against
   * (that warning is about never trusting a claimed *card* payment).
   */
  async confirmCashPayment(jobType: PayableJobType, jobId: string, driverUserId: string) {
    const job = await this.getRequiredPayableJob(jobType, jobId);
    if (job.driverUserId !== driverUserId) {
      throw new ForbiddenException(`This ${jobType} is not assigned to you.`);
    }
    if (!job.isCompleted) {
      throw new BadRequestException(`The ${jobType} must be completed before confirming payment.`);
    }

    const payment = await this.findPaymentForJob(jobType, jobId);
    if (!payment) {
      throw new NotFoundException(`No payment record exists for this ${jobType} yet.`);
    }
    if (payment.method !== (PaymentMethod.CASH as any)) {
      throw new BadRequestException(`This ${jobType} was not set up for cash payment.`);
    }
    if (payment.status === (PaymentStatus.PAID as any)) {
      throw new BadRequestException('This payment has already been confirmed.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.PAID as any, paidAt: new Date() },
      });
      await tx.transaction.create({
        data: {
          paymentId: payment.id,
          eventType: 'cash.confirmed',
          amountKobo: payment.amountKobo,
          accepted: true,
        },
      });
      return result;
    });

    await this.creditDriverForJob(job, payment.amountKobo);
    return updated;
  }

  async getPayment(jobType: PayableJobType, jobId: string, requestingUserId: string, requestingRole: Role) {
    const job = await this.getRequiredPayableJob(jobType, jobId);
    const isParty = job.payerUserId === requestingUserId || job.driverUserId === requestingUserId;
    const isAdmin = requestingRole === Role.ADMIN || requestingRole === Role.SUPER_ADMIN;
    if (!isParty && !isAdmin) {
      throw new ForbiddenException('You do not have access to this payment.');
    }
    return this.findPaymentForJob(jobType, jobId);
  }

  private async creditDriverForJob(job: PayableJob, amountKobo: number): Promise<void> {
    if (job.driverUserId) {
      const driverProfile = await this.prisma.driverProfile.findUnique({ where: { userId: job.driverUserId } });
      if (driverProfile) {
        const commissionKobo = Math.round((amountKobo * job.platformCommissionBasisPoints) / 10_000);
        const driverEarningsKobo = Math.max(amountKobo - commissionKobo, 0);
        await this.walletService.creditForJob(
          driverProfile.id,
          job.id,
          driverEarningsKobo,
          `Earnings for ${job.type} ${job.id}`,
        );
      }
    }

    // Decoupled from any notification concern — NotificationsModule (if
    // present) listens for this to push a receipt to the payer and a
    // payout notice to the driver. PaymentsService has no knowledge of
    // push notifications.
    this.eventEmitter.emit('payment.paid', {
      jobType: job.type,
      jobId: job.id,
      payerUserId: job.payerUserId,
      driverUserId: job.driverUserId,
      amountKobo,
    });
  }

  private async getRequiredPayableJob(jobType: PayableJobType, jobId: string): Promise<PayableJob> {
    if (jobType === 'ride') {
      const ride = await this.prisma.ride.findUnique({ where: { id: jobId } });
      if (!ride) throw new NotFoundException('Ride not found.');
      return this.mapRideToJob(ride);
    }
    const delivery = await this.prisma.delivery.findUnique({ where: { id: jobId } });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    return this.mapDeliveryToJob(delivery);
  }

  private mapRideToJob(ride: {
    id: string;
    passengerUserId: string;
    driverUserId: string | null;
    status: string;
    finalFareKobo: number | null;
    currency: string;
    platformCommissionBasisPoints: number;
  }): PayableJob {
    return {
      type: 'ride',
      id: ride.id,
      payerUserId: ride.passengerUserId,
      driverUserId: ride.driverUserId,
      finalFareKobo: ride.finalFareKobo,
      currency: ride.currency,
      platformCommissionBasisPoints: ride.platformCommissionBasisPoints,
      isCompleted: ride.status === (RideStatus.COMPLETED as any),
    };
  }

  private mapDeliveryToJob(delivery: {
    id: string;
    senderUserId: string;
    driverUserId: string | null;
    status: string;
    finalFareKobo: number | null;
    currency: string;
    platformCommissionBasisPoints: number;
  }): PayableJob {
    return {
      type: 'delivery',
      id: delivery.id,
      payerUserId: delivery.senderUserId,
      driverUserId: delivery.driverUserId,
      finalFareKobo: delivery.finalFareKobo,
      currency: delivery.currency,
      platformCommissionBasisPoints: delivery.platformCommissionBasisPoints,
      isCompleted: delivery.status === (DeliveryStatus.DELIVERED as any),
    };
  }

  private async findPaymentForJob(jobType: PayableJobType, jobId: string) {
    return this.prisma.payment.findUnique({
      where: jobType === 'ride' ? { rideId: jobId } : { deliveryId: jobId },
    });
  }

  private async recordTransaction(paymentId: string, event: WebhookEvent, accepted: boolean, note: string) {
    await this.prisma.transaction.create({
      data: {
        paymentId,
        eventType: event.eventType,
        amountKobo: event.amountKobo,
        providerReference: event.providerReference,
        accepted,
        note,
      },
    });
  }
}
