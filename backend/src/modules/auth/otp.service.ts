import { BadRequestException, Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { hmacHash, constantTimeEquals } from '../../common/utils/hash.util';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms-provider.interface';
import { OtpPurpose } from '@prisma/client';

/**
 * Handles OTP lifecycle: generation, delivery (via injected provider),
 * hashed storage, expiry, attempt limiting, and verification.
 *
 * The raw OTP code is NEVER stored — only an HMAC hash of it, so a
 * database leak alone cannot be used to log in as anyone.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  async requestOtp(phone: string, purpose: OtpPurpose, requestIp?: string): Promise<void> {
    const { codeLength, ttlSeconds, maxAttempts, resendCooldownSeconds } = this.config.otp;

    const recent = await this.prisma.otpChallenge.findFirst({
      where: { phone, purpose },
      orderBy: { createdAt: 'desc' },
    });

    if (recent) {
      const secondsSinceLast = (Date.now() - recent.createdAt.getTime()) / 1000;
      if (secondsSinceLast < resendCooldownSeconds) {
        throw new HttpException(
          `Please wait before requesting another code.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = this.generateCode(codeLength);
    const codeHash = hmacHash(code, this.config.jwt.accessSecret);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.otpChallenge.create({
      data: { phone, purpose, codeHash, maxAttempts, expiresAt, requestIp },
    });

    await this.smsProvider.send(phone, `Your NEXA verification code is ${code}. It expires in ${Math.round(ttlSeconds / 60)} minutes.`);
  }

  async verifyOtp(phone: string, purpose: OtpPurpose, code: string): Promise<void> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new BadRequestException('No active verification code found. Please request a new one.');
    }

    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This code has expired. Please request a new one.');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      throw new BadRequestException('Too many incorrect attempts. Please request a new code.');
    }

    const candidateHash = hmacHash(code, this.config.jwt.accessSecret);
    const isValid = constantTimeEquals(candidateHash, challenge.codeHash);

    if (!isValid) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect code. Please try again.');
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
  }

  private generateCode(length: number): string {
    const max = 10 ** length;
    const code = randomInt(0, max);
    return code.toString().padStart(length, '0');
  }
}
