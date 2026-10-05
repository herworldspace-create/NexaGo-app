/**
 * Abstraction over an authorized Nigerian identity verification provider.
 *
 * IMPORTANT: No implementation of this interface may scrape or directly
 * query government systems. Only an authorized provider integration
 * (with proper consent and commercial/legal agreement in place) may be
 * used in production. The `MockIdentityVerificationProvider` in this
 * codebase performs NO real verification and must never be used outside
 * development/testing.
 */
export interface NinVerificationRequest {
  userId: string;
  nin: string;
  fullNameAsProvided: string;
  dateOfBirth: string; // ISO date
  /** Records that explicit user consent was captured before this call. */
  consentTimestamp: string;
}

export type NinVerificationOutcome = 'VERIFIED' | 'FAILED' | 'PENDING';

export interface NinVerificationResult {
  outcome: NinVerificationOutcome;
  /** Opaque reference from the provider for audit/support purposes. Never the NIN itself. */
  providerReference: string;
  /** Full name as held by the provider, for cross-checking — only if the provider returns it. */
  verifiedFullName?: string;
  /** Present only when outcome is FAILED, and must be a safe, user-facing string. */
  failureReason?: string;
}

export interface IdentityVerificationService {
  /**
   * Submits a NIN verification request to the configured provider.
   * Implementations must NOT persist the raw NIN themselves — that is the
   * caller's (application service's) responsibility, and even then only a
   * hash should be stored, never the raw value.
   */
  verifyNin(request: NinVerificationRequest): Promise<NinVerificationResult>;

  /**
   * Some providers are asynchronous (submit now, webhook/poll later).
   * Returns the current status for a previously-submitted reference.
   */
  checkStatus(providerReference: string): Promise<NinVerificationResult>;
}

export const IDENTITY_VERIFICATION_SERVICE = Symbol('IDENTITY_VERIFICATION_SERVICE');
