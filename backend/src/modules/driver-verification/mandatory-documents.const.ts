import { DriverDocumentType } from '../../common/enums/verification-status.enum';

/**
 * The set of document types that must all be APPROVED (and not expired)
 * for a driver to (a) move out of admin DOCUMENT_REVIEW and (b) remain
 * eligible for ride matching even after activation — a document expiring
 * post-activation should immediately exclude the driver from new matches.
 *
 * This is a fixed list for now. A later phase should make this
 * configurable per operating city/state from the admin dashboard, since
 * requirements legitimately differ by jurisdiction.
 */
export const MANDATORY_DRIVER_DOCUMENT_TYPES: DriverDocumentType[] = [
  DriverDocumentType.DRIVERS_LICENCE,
  DriverDocumentType.VEHICLE_REGISTRATION,
  DriverDocumentType.VEHICLE_INSURANCE,
  DriverDocumentType.ROADWORTHINESS_CERTIFICATE,
];
