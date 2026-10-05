/**
 * Passenger-level account verification status.
 * A passenger cannot request rides until IDENTITY_VERIFIED.
 */
export enum PassengerVerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PHONE_VERIFIED = 'PHONE_VERIFIED',
  IDENTITY_PENDING = 'IDENTITY_PENDING',
  IDENTITY_VERIFIED = 'IDENTITY_VERIFIED',
  IDENTITY_FAILED = 'IDENTITY_FAILED',
  SUSPENDED = 'SUSPENDED',
}

/**
 * Driver onboarding / verification workflow.
 * A driver cannot accept rides until ACTIVE. This is enforced server-side,
 * never on the client.
 */
export enum DriverVerificationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  IDENTITY_PENDING = 'IDENTITY_PENDING',
  DOCUMENTS_PENDING = 'DOCUMENTS_PENDING',
  DOCUMENT_REVIEW = 'DOCUMENT_REVIEW',
  BACKGROUND_CHECK_PENDING = 'BACKGROUND_CHECK_PENDING',
  ADMIN_REVIEW = 'ADMIN_REVIEW',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  IDENTITY_FAILED = 'IDENTITY_FAILED',
  DOCUMENT_REJECTED = 'DOCUMENT_REJECTED',
  EXPIRED_DOCUMENT = 'EXPIRED_DOCUMENT',
  ADMIN_REJECTED = 'ADMIN_REJECTED',
  SUSPENDED = 'SUSPENDED',
  DEACTIVATED = 'DEACTIVATED',
}

/** Terminal/blocking states in which a driver must not be allowed to go online or accept rides. */
export const DRIVER_BLOCKED_STATUSES: ReadonlySet<DriverVerificationStatus> = new Set([
  DriverVerificationStatus.DRAFT,
  DriverVerificationStatus.SUBMITTED,
  DriverVerificationStatus.IDENTITY_PENDING,
  DriverVerificationStatus.DOCUMENTS_PENDING,
  DriverVerificationStatus.DOCUMENT_REVIEW,
  DriverVerificationStatus.BACKGROUND_CHECK_PENDING,
  DriverVerificationStatus.ADMIN_REVIEW,
  DriverVerificationStatus.APPROVED, // approved but not yet activated
  DriverVerificationStatus.IDENTITY_FAILED,
  DriverVerificationStatus.DOCUMENT_REJECTED,
  DriverVerificationStatus.EXPIRED_DOCUMENT,
  DriverVerificationStatus.ADMIN_REJECTED,
  DriverVerificationStatus.SUSPENDED,
  DriverVerificationStatus.DEACTIVATED,
]);

/** Single per-record identity verification result, independent of passenger/driver context. */
export enum IdentityVerificationStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export enum DocumentStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  SUPERSEDED = 'SUPERSEDED',
}

export enum DriverDocumentType {
  DRIVERS_LICENCE = 'DRIVERS_LICENCE',
  VEHICLE_REGISTRATION = 'VEHICLE_REGISTRATION',
  VEHICLE_INSURANCE = 'VEHICLE_INSURANCE',
  ROADWORTHINESS_CERTIFICATE = 'ROADWORTHINESS_CERTIFICATE',
  VEHICLE_INSPECTION = 'VEHICLE_INSPECTION',
  PROOF_OF_ADDRESS = 'PROOF_OF_ADDRESS',
  OTHER = 'OTHER',
}
