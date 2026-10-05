import { Module } from '@nestjs/common';
import { FareModule } from '../fare/fare.module';
import { DriverVerificationModule } from '../driver-verification/driver-verification.module';
import { RidesController } from './rides.controller';
import { DriverRidesController } from './driver-rides.controller';
import { RidesService } from './rides.service';

@Module({
  imports: [FareModule, DriverVerificationModule],
  controllers: [RidesController, DriverRidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}
