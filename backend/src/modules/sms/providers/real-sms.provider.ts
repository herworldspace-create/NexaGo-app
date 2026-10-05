import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { SmsProvider } from '../sms-provider.interface';

/**
 * Adapter for a real SMS provider (e.g. Termii, Africa's Talking, Twilio).
 *
 * NOT YET WIRED TO A REAL PROVIDER. To activate:
 *   1. Choose a provider and obtain an API key.
 *   2. Set SMS_PROVIDER_API_KEY and SMS_PROVIDER_SENDER_ID in .env.
 *   3. Implement the HTTP call to the provider's send-SMS endpoint below.
 *   4. Set OTP_PROVIDER=sms (this same provider backs both OTP delivery
 *      and delivery-recipient PIN notifications).
 *
 * The rest of the codebase depends only on the SmsProvider interface —
 * swapping providers never requires touching auth or delivery logic.
 */
@Injectable()
export class RealSmsProvider implements SmsProvider {
  constructor(private readonly config: AppConfigService) {}

  async send(_phone: string, _message: string): Promise<void> {
    throw new Error(
      'RealSmsProvider is not yet configured. Set SMS_PROVIDER_API_KEY and ' +
        'implement the provider HTTP call before setting OTP_PROVIDER=sms.',
    );
  }
}
