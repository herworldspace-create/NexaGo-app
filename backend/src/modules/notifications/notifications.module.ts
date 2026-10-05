import { Module } from '@nestjs/common';
import { RidesModule } from '../rides/rides.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RideNotificationsListener } from './ride-notifications.listener';
import { PaymentNotificationsListener } from './payment-notifications.listener';
import { NOTIFICATION_PROVIDER } from './interfaces/notification-provider.interface';
import { FcmNotificationProvider } from './providers/fcm-notification.provider';

@Module({
  imports: [RidesModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    RideNotificationsListener,
    PaymentNotificationsListener,
    FcmNotificationProvider,
    { provide: NOTIFICATION_PROVIDER, useExisting: FcmNotificationProvider },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
