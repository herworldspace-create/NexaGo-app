import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import {
  IdentityVerificationService,
  NinVerificationRequest,
  NinVerificationResult,
} from '../interfaces/identity-verification.interface';

/**
 * Adapter for a real, authorized Nigerian identity verification provider
 * (e.g. a licensed NIMC-connected vendor). NOT YET IMPLEMENTED.
 *
 * To activate:
 *   1. Execute a data-processing/verification agreement with an authorized
 *      provider and obtain API credentials.
 *   2. Set IDENTITY_PROVIDER_BASE_URL, IDENTITY_PROVIDER_API_KEY,
 *      IDENTITY_PROVIDER_CLIENT_ID, and IDENTITY_PROVIDER_WEBHOOK_SECRET.
 *   3. Implement verifyNin/checkStatus below using that provider's API
 *      contract (this is the only file that should need to change).
 *   4. Set IDENTITY_PROVIDER=live.
 *
 * Do not attempt to query NIMC or any government system directly.
 */
@Injectable()
export class LiveIdentityVerificationProvider implements IdentityVerificationService {
  constructor(private readonly config: AppConfigService) {}

  async verifyNin(_request: NinVerificationRequest): Promise<NinVerificationResult> {
    throw new Error(
      'LiveIdentityVerificationProvider is not yet configured. An authorized ' +
        'identity verification provider integration must be implemented before ' +
        'setting IDENTITY_PROVIDER=live.',
    );
  }

  async checkStatus(_providerReference: string): Promise<NinVerificationResult> {
    throw new Error('LiveIdentityVerificationProvider is not yet configured.');
  }
}
