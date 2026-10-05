import { Module } from '@nestjs/common';
import {
  DriverVerificationController,
  DriverLocationController,
  DriverVehiclesController,
} from './driver-verification.controller';
import { DriverVerificationService } from './driver-verification.service';
import { DriverLocationService } from './driver-location.service';
import { DriverVehiclesService } from './driver-vehicles.service';

@Module({
  controllers: [DriverVerificationController, DriverLocationController, DriverVehiclesController],
  providers: [DriverVerificationService, DriverLocationService, DriverVehiclesService],
  exports: [DriverVerificationService, DriverLocationService, DriverVehiclesService],
})
export class DriverVerificationModule {}
