import { DriverVerificationStatus } from '../../common/enums/verification-status.enum';
import {
  assertValidTransition,
  canAcceptRides,
  InvalidDriverStatusTransitionError,
} from './driver-verification.state-machine';

describe('DriverVerificationStateMachine', () => {
  it('allows the standard happy-path progression', () => {
    const happyPath: DriverVerificationStatus[] = [
      DriverVerificationStatus.DRAFT,
      DriverVerificationStatus.SUBMITTED,
      DriverVerificationStatus.IDENTITY_PENDING,
      DriverVerificationStatus.DOCUMENTS_PENDING,
      DriverVerificationStatus.DOCUMENT_REVIEW,
      DriverVerificationStatus.ADMIN_REVIEW,
      DriverVerificationStatus.APPROVED,
      DriverVerificationStatus.ACTIVE,
    ];

    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(() => assertValidTransition(happyPath[i], happyPath[i + 1])).not.toThrow();
    }
  });

  it('rejects skipping required steps', () => {
    expect(() =>
      assertValidTransition(DriverVerificationStatus.DRAFT, DriverVerificationStatus.ACTIVE),
    ).toThrow(InvalidDriverStatusTransitionError);
  });

  it('rejects transitions out of a terminal state', () => {
    expect(() =>
      assertValidTransition(
        DriverVerificationStatus.DEACTIVATED,
        DriverVerificationStatus.ACTIVE,
      ),
    ).toThrow(InvalidDriverStatusTransitionError);
  });

  it('allows recovering from document rejection back into the review cycle', () => {
    expect(() =>
      assertValidTransition(
        DriverVerificationStatus.DOCUMENT_REJECTED,
        DriverVerificationStatus.DOCUMENTS_PENDING,
      ),
    ).not.toThrow();
  });

  it('only reports ACTIVE drivers as eligible to accept rides', () => {
    expect(canAcceptRides(DriverVerificationStatus.ACTIVE)).toBe(true);
    expect(canAcceptRides(DriverVerificationStatus.APPROVED)).toBe(false);
    expect(canAcceptRides(DriverVerificationStatus.SUSPENDED)).toBe(false);
    expect(canAcceptRides(DriverVerificationStatus.DRAFT)).toBe(false);
  });
});
