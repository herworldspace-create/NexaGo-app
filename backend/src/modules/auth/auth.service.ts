import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { OtpPurpose, Role as PrismaRole } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { OtpService } from './otp.service';
import { TokenService, TokenPair } from './token.service';
import { Role } from '../../common/enums/role.enum';
import { PassengerVerificationStatus, DriverVerificationStatus } from '../../common/enums/verification-status.enum';
import * as bcrypt from 'bcrypt';

interface RequestContext {
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
  ) {}

  async requestOtp(phone: string, ipAddress?: string): Promise<void> {
    await this.otpService.requestOtp(phone, OtpPurpose.LOGIN, ipAddress);
  }

  async verifyOtpAndAuthenticate(
    phone: string,
    code: string,
    intendedRole: Role.PASSENGER | Role.DRIVER,
    context: RequestContext,
  ): Promise<{ tokens: TokenPair; userId: string; role: Role; isNewAccount: boolean }> {
    await this.otpService.verifyOtp(phone, OtpPurpose.LOGIN, code);

    let user = await this.prisma.user.findUnique({ where: { phone } });
    let isNewAccount = false;

    if (!user) {
      isNewAccount = true;
      user = await this.prisma.user.create({
        data: {
          phone,
          phoneVerifiedAt: new Date(),
          role: intendedRole as unknown as PrismaRole,
          ...(intendedRole === Role.PASSENGER
            ? {
                passengerProfile: {
                  create: { verificationStatus: PassengerVerificationStatus.PHONE_VERIFIED as any },
                },
              }
            : {
                driverProfile: {
                  create: { verificationStatus: DriverVerificationStatus.DRAFT as any },
                },
              }),
        },
      });
    } else if (!user.phoneVerifiedAt) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerifiedAt: new Date() },
      });
    }

    const tokens = await this.tokenService.issueTokenPair({
      userId: user.id,
      role: user.role as Role,
      ...context,
    });

    return { tokens, userId: user.id, role: user.role as Role, isNewAccount };
  }

  // --- NEW: Email & Password Authentication Methods ---

  async registerWithEmail(
    email: string,
    pass: string,
    intendedRole: Role.PASSENGER | Role.DRIVER,
    context: RequestContext,
  ): Promise<{ tokens: TokenPair; userId: string; role: Role }> {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(pass, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: intendedRole as unknown as PrismaRole,
        ...(intendedRole === Role.PASSENGER
          ? {
              passengerProfile: {
                create: { verificationStatus: PassengerVerificationStatus.UNVERIFIED as any },
              },
            }
          : {
              driverProfile: {
                create: { verificationStatus: DriverVerificationStatus.DRAFT as any },
              },
            }),
      },
    });

    const tokens = await this.tokenService.issueTokenPair({
      userId: user.id,
      role: user.role as Role,
      ...context,
    });

    return { tokens, userId: user.id, role: user.role as Role };
  }

  async loginWithEmail(
    email: string,
    pass: string,
    context: RequestContext,
  ): Promise<{ tokens: TokenPair; userId: string; role: Role }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.tokenService.issueTokenPair({
      userId: user.id,
      role: user.role as Role,
      ...context,
    });

    return { tokens, userId: user.id, role: user.role as Role };
  }

  // ----------------------------------------------------

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokenService.rotateRefreshToken(refreshToken);
  }

  async logout(sessionId: string): Promise<void> {
    await this.tokenService.revokeSession(sessionId);
  }
}
