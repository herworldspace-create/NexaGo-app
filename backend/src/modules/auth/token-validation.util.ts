import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AuthenticatedUser } from './types/authenticated-user.type';
import { Role } from '../../common/enums/role.enum';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  sid: string;
}

/**
 * The single place that turns a decoded JWT payload into a trusted
 * AuthenticatedUser — checks the referenced device session is still valid
 * (not revoked/expired) and the user is still active. Both the REST
 * JwtStrategy and the WebSocket gateway call this so a revoked session is
 * rejected identically everywhere, rather than re-implementing the check.
 */
export async function resolveAuthenticatedUser(
  prisma: PrismaService,
  payload: AccessTokenPayload,
): Promise<AuthenticatedUser> {
  const session = await prisma.deviceSession.findUnique({ where: { id: payload.sid } });

  if (!session || session.isRevoked || session.expiresAt.getTime() < Date.now()) {
    throw new UnauthorizedException('Session is no longer valid. Please log in again.');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
    throw new UnauthorizedException('Account is not active.');
  }

  return { userId: user.id, role: user.role as Role, sessionId: session.id };
}
