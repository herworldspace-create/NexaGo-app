import { DriverVerificationStatus } from '../../common/enums/verification-status.enum';

/**
 * Explicit allow-list of state transitions. Any transition not listed here
 * is rejected, so the workflow can only move through the states the
 * business has defined — never skipped or reversed by accident.
 */
const ALLOWED_TRANSITIONS: Record<DriverVerificationStatus, DriverVerificationStatus[]> = {
  [DriverVerificationStatus.DRAFT]: [DriverVerificationStatus.SUBMITTED],
  [DriverVerificationStatus.SUBMITTED]: [
    DriverVerificationStatus.IDENTITY_PENDING,
    DriverVerificationStatus.IDENTITY_FAILED,
  ],
  [DriverVerificationStatus.IDENTITY_PENDING]: [
    DriverVerificationStatus.DOCUMENTS_PENDING,
    DriverVerificationStatus.IDENTITY_FAILED,
  ],
  [DriverVerificationStatus.IDENTITY_FAILED]: [DriverVerificationStatus.IDENTITY_PENDING],
  [DriverVerificationStatus.DOCUMENTS_PENDING]: [DriverVerificationStatus.DOCUMENT_REVIEW],
  [DriverVerificationStatus.DOCUMENT_REVIEW]: [
    DriverVerificationStatus.BACKGROUND_CHECK_PENDING,
    DriverVerificationStatus.ADMIN_REVIEW,
    DriverVerificationStatus.DOCUMENT_REJECTED,
  ],
  [DriverVerificationStatus.DOCUMENT_REJECTED]: [DriverVerificationStatus.DOCUMENTS_PENDING],
  [DriverVerificationStatus.BACKGROUND_CHECK_PENDING]: [DriverVerificationStatus.ADMIN_REVIEW],
  [DriverVerificationStatus.ADMIN_REVIEW]: [
    DriverVerificationStatus.APPROVED,
    DriverVerificationStatus.ADMIN_REJECTED,
  ],
  [DriverVerificationStatus.ADMIN_REJECTED]: [DriverVerificationStatus.DOCUMENTS_PENDING],
  [DriverVerificationStatus.APPROVED]: [DriverVerificationStatus.ACTIVE],
  [DriverVerificationStatus.ACTIVE]: [
    DriverVerificationStatus.SUSPENDED,
    DriverVerificationStatus.DEACTIVATED,
    DriverVerificationStatus.EXPIRED_DOCUMENT,
  ],
  [DriverVerificationStatus.EXPIRED_DOCUMENT]: [DriverVerificationStatus.DOCUMENTS_PENDING],
  [DriverVerificationStatus.SUSPENDED]: [
    DriverVerificationStatus.ACTIVE,
    DriverVerificationStatus.DEACTIVATED,
  ],
  [DriverVerificationStatus.DEACTIVATED]: [],
};

export class InvalidDriverStatusTransitionError extends Error {
  constructor(from: DriverVerificationStatus, to: DriverVerificationStatus) {
    super(`Cannot transition driver verification status from ${from} to ${to}.`);
  }
}

export function assertValidTransition(
  from: DriverVerificationStatus,
  to: DriverVerificationStatus,
): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidDriverStatusTransitionError(from, to);
  }
}

export function canAcceptRides(status: DriverVerificationStatus): boolean {
  return status === DriverVerificationStatus.ACTIVE;
}
