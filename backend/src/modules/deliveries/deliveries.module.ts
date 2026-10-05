import { Module } from '@nestjs/common';
import { FareModule } from '../fare/fare.module';
import { DriverVerificationModule } from '../driver-verification/driver-verification.module';
import { SmsModule } from '../sms/sms.module';
import { DeliveriesController } from './deliveries.controller';
import { DriverDeliveriesController } from './driver-deliveries.controller';
import { DeliveriesService } from './deliveries.service';

@Module({
  imports: [FareModule, DriverVerificationModule, SmsModule],
  controllers: [DeliveriesController, DriverDeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
