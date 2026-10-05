import { Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { AppConfigService } from '../../config/app-config.service';
import { SMS_PROVIDER } from './sms-provider.interface';
import { ConsoleSmsProvider } from './providers/console-sms.provider';
import { RealSmsProvider } from './providers/real-sms.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    ConsoleSmsProvider,
    RealSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [AppConfigService, ConsoleSmsProvider, RealSmsProvider],
      useFactory: (config: AppConfigService, consoleProvider: ConsoleSmsProvider, realProvider: RealSmsProvider) =>
        config.otp.provider === 'sms' ? realProvider : consoleProvider,
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
