import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from '../sms-provider.interface';

/**
 * Development/test-only SMS provider. Logs the message instead of
 * sending a real SMS. `validateEnv` refuses to boot with this provider
 * when NODE_ENV=production, so this can never accidentally ship live.
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('ConsoleSmsProvider [DEV ONLY]');

  async send(phone: string, message: string): Promise<void> {
    this.logger.warn(`DEV MODE — not sending real SMS. To ${phone}: ${message}`);
    return Promise.resolve();
  }
}
