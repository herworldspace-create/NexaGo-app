import { UnauthorizedException } from '@nestjs/common';
import { resolveAuthenticatedUser } from './token-validation.util';
import { PrismaService } from '../../config/prisma.service';
import { Role } from '../../common/enums/role.enum';

function buildPrismaMock() {
  return {
    deviceSession: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
}

const payload = { sub: 'user-1', role: Role.PASSENGER, sid: 'session-1' };

describe('resolveAuthenticatedUser', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
  });

  it('resolves a valid session + active user', async () => {
    prisma.deviceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: Role.PASSENGER, status: 'ACTIVE', deletedAt: null });

    const result = await resolveAuthenticatedUser(prisma as unknown as PrismaService, payload);
    expect(result).toEqual({ userId: 'user-1', role: Role.PASSENGER, sessionId: 'session-1' });
  });

  it('rejects when the session does not exist', async () => {
    prisma.deviceSession.findUnique.mockResolvedValue(null);
    await expect(resolveAuthenticatedUser(prisma as unknown as PrismaService, payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a revoked session', async () => {
    prisma.deviceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      isRevoked: true,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(resolveAuthenticatedUser(prisma as unknown as PrismaService, payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired session', async () => {
    prisma.deviceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      isRevoked: false,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(resolveAuthenticatedUser(prisma as unknown as PrismaService, payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a suspended user even with a valid session', async () => {
    prisma.deviceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: Role.PASSENGER, status: 'SUSPENDED', deletedAt: null });

    await expect(resolveAuthenticatedUser(prisma as unknown as PrismaService, payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a soft-deleted user', async () => {
    prisma.deviceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: Role.PASSENGER, status: 'ACTIVE', deletedAt: new Date() });

    await expect(resolveAuthenticatedUser(prisma as unknown as PrismaService, payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
