import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { paymentPaidNotification } from './notification-content.util';
import { koboToNaira } from '../fare/fare-calculation.util';
import { PayableJobType } from '../payments/payments.service';

interface PaymentPaidEvent {
  jobType: PayableJobType;
  jobId: string;
  payerUserId: string;
  driverUserId?: string | null;
  amountKobo: number;
}

@Injectable()
export class PaymentNotificationsListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('payment.paid')
  async handlePaymentPaid(event: PaymentPaidEvent): Promise<void> {
    const amountNaira = koboToNaira(event.amountKobo);
    const idKey = event.jobType === 'ride' ? 'rideId' : 'deliveryId';
    const data = { [idKey]: event.jobId };

    await this.notifications.notify(event.payerUserId, paymentPaidNotification('passenger', amountNaira), data);

    if (event.driverUserId) {
      await this.notifications.notify(event.driverUserId, paymentPaidNotification('driver', amountNaira), data);
    }
  }
}
