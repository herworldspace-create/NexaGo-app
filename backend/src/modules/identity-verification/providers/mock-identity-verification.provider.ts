import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IdentityVerificationService,
  NinVerificationRequest,
  NinVerificationResult,
} from '../interfaces/identity-verification.interface';

/**
 * Development/testing stand-in ONLY. This performs no real lookups against
 * any government or commercial identity database. It exists purely so the
 * rest of the application (state machines, endpoints, tests) can be built
 * and exercised before an authorized provider contract is in place.
 *
 * `validateEnv` prevents this provider from being selected when
 * NODE_ENV=production.
 *
 * Behaviour: deterministic based on the last digit of the NIN, so tests are
 * repeatable — NINs ending in 0-7 verify, 8 fails, 9 stays pending.
 */
@Injectable()
export class MockIdentityVerificationProvider implements IdentityVerificationService {
  private readonly logger = new Logger('MockIdentityVerificationProvider [DEV ONLY]');
  private readonly pending = new Map<string, NinVerificationResult>();

  async verifyNin(request: NinVerificationRequest): Promise<NinVerificationResult> {
    this.logger.warn(
      `DEV MODE — simulating NIN verification for user ${request.userId}. No real provider was called.`,
    );

    const providerReference = `MOCK-${randomUUID()}`;
    const lastDigit = request.nin.trim().slice(-1);

    let result: NinVerificationResult;
    if (lastDigit === '8') {
      result = {
        outcome: 'FAILED',
        providerReference,
        failureReason: 'The information provided could not be verified.',
      };
    } else if (lastDigit === '9') {
      result = { outcome: 'PENDING', providerReference };
      this.pending.set(providerReference, {
        outcome: 'VERIFIED',
        providerReference,
        verifiedFullName: request.fullNameAsProvided,
      });
    } else {
      result = {
        outcome: 'VERIFIED',
        providerReference,
        verifiedFullName: request.fullNameAsProvided,
      };
    }

    return Promise.resolve(result);
  }

  async checkStatus(providerReference: string): Promise<NinVerificationResult> {
    const resolved = this.pending.get(providerReference);
    if (resolved) {
      this.pending.delete(providerReference);
      return Promise.resolve(resolved);
    }
    return Promise.resolve({ outcome: 'PENDING', providerReference });
  }
}
