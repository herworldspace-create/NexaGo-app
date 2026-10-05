import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../config/prisma.service';
import { hmacHash } from '../../common/utils/hash.util';
import { Role } from '../../common/enums/role.enum';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface IssueTokensParams {
  userId: string;
  role: Role;
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Refresh tokens are opaque random strings, stored only as a hash
 * (DeviceSession.refreshTokenHash) so a DB leak cannot be replayed as a
 * valid refresh token. Access tokens are short-lived JWTs bound to a
 * specific session id, so revoking the session immediately invalidates
 * any access tokens minted under it (checked in JwtStrategy).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issueTokenPair(params: IssueTokensParams): Promise<TokenPair> {
    const refreshToken = randomUUID() + randomUUID();
    const refreshTokenHash = hmacHash(refreshToken, this.config.jwt.refreshSecret);
    const refreshExpiresAt = this.addDuration(new Date(), this.config.jwt.refreshExpiresIn);

    const session = await this.prisma.deviceSession.create({
      data: {
        userId: params.userId,
        deviceId: params.deviceId,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
        refreshTokenHash,
        expiresAt: refreshExpiresAt,
      },
    });

    const accessToken = await this.jwtService.signAsync(
      { sub: params.userId, role: params.role, sid: session.id },
      { secret: this.config.jwt.accessSecret, expiresIn: this.config.jwt.accessExpiresIn },
    );

    return { accessToken, refreshToken, expiresIn: this.config.jwt.accessExpiresIn };
  }

  async rotateRefreshToken(presentedRefreshToken: string): Promise<TokenPair> {
    const presentedHash = hmacHash(presentedRefreshToken, this.config.jwt.refreshSecret);

    const session = await this.prisma.deviceSession.findFirst({
      where: { refreshTokenHash: presentedHash, isRevoked: false },
      include: { user: true },
    });

    if (!session || session.expiresAt.getTime() < Date.now() || !session.user) {
      throw new Error('Invalid or expired refresh token.');
    }

    // Revoke the old session (rotation) and issue a fresh one.
    await this.prisma.deviceSession.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    return this.issueTokenPair({
      userId: session.userId,
      role: session.user.role as Role,
      deviceId: session.deviceId ?? undefined,
      userAgent: session.userAgent ?? undefined,
      ipAddress: session.ipAddress ?? undefined,
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.deviceSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
  }

  private addDuration(base: Date, duration: string): Date {
    const match = /^(\d+)([smhd])$/.exec(duration.trim());
    if (!match) {
      // Fall back to 30 days if an unexpected format sneaks in.
      return new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    const value = Number(match[1]);
    const unitMs: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return new Date(base.getTime() + value * unitMs[match[2]]);
  }
}
