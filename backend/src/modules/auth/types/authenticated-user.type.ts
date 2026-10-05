import { Role } from '../../../common/enums/role.enum';

/**
 * Minimal, non-sensitive user context attached to `request.user` after a
 * JWT is validated. Never put NIN, document data, or other sensitive
 * fields in the token payload or this type.
 */
export interface AuthenticatedUser {
  userId: string;
  role: Role;
  sessionId: string;
}
