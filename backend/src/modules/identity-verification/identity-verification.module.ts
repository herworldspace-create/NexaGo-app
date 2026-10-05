import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { ConfigModule } from '../../config/config.module';
import { IdentityVerificationController } from './identity-verification.controller';
import { IdentityVerificationAppService } from './identity-verification.service';
import { IDENTITY_VERIFICATION_SERVICE } from './interfaces/identity-verification.interface';
import { MockIdentityVerificationProvider } from './providers/mock-identity-verification.provider';
import { LiveIdentityVerificationProvider } from './providers/live-identity-verification.provider';

@Module({
  imports: [ConfigModule],
  controllers: [IdentityVerificationController],
  providers: [
    IdentityVerificationAppService,
    MockIdentityVerificationProvider,
    LiveIdentityVerificationProvider,
    {
      provide: IDENTITY_VERIFICATION_SERVICE,
      inject: [AppConfigService, MockIdentityVerificationProvider, LiveIdentityVerificationProvider],
      useFactory: (
        config: AppConfigService,
        mock: MockIdentityVerificationProvider,
        live: LiveIdentityVerificationProvider,
      ) => (config.identityProvider.provider === 'live' ? live : mock),
    },
  ],
  exports: [IdentityVerificationAppService],
})
export class IdentityVerificationModule {}
