import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from '../../config/app-config.service';
import { RidesModule } from '../rides/rides.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DriverVerificationModule } from '../driver-verification/driver-verification.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [
    RidesModule,
    DeliveriesModule,
    DriverVerificationModule,
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwt.accessSecret,
      }),
    }),
  ],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
