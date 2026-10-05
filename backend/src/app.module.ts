import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ValidationPipe } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaModule } from './config/prisma.module';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { IdentityVerificationModule } from './modules/identity-verification/identity-verification.module';
import { DriverVerificationModule } from './modules/driver-verification/driver-verification.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { AdminModule } from './modules/admin/admin.module';
import { FareModule } from './modules/fare/fare.module';
import { RidesModule } from './modules/rides/rides.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { ComplaintsModule } from './modules/complaints/complaints.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { RouteModule } from './modules/route/route.module';
import { UserWalletModule } from './modules/user-wallet/user-wallet.module';
import { VtuModule } from './modules/vtu/vtu.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ ttl: config.throttle.ttlSeconds * 1000, limit: config.throttle.limit }],
      }),
    }),
    AuthModule,
    UsersModule,
    IdentityVerificationModule,
    DriverVerificationModule,
    DocumentsModule,
    AdminModule,
    FareModule,
    RidesModule,
    RealtimeModule,
    PaymentsModule,
    NotificationsModule,
    RatingsModule,
    ComplaintsModule,
    DeliveriesModule,
    RouteModule,
    UserWalletModule,
    VtuModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global validation: every DTO is validated; unknown properties are stripped.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    // Global rate limiting.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global authentication — every route requires a valid JWT unless @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global RBAC — enforced server-side, never trusting the frontend.
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
