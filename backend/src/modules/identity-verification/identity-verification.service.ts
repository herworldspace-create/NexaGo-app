import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import {
  IDENTITY_VERIFICATION_SERVICE,
  IdentityVerificationService,
} from './interfaces/identity-verification.interface';
import { hmacHash } from '../../common/utils/hash.util';
import { AppConfigService } from '../../config/app-config.service';
import {
  IdentityVerificationStatus,
  PassengerVerificationStatus,
} from '../../common/enums/verification-status.enum';
import { ConsentType } from '@prisma/client';

interface InitiateParams {
  userId: string;
  nin: string;
  fullName: string;
  dateOfBirth: string;
  ipAddress?: string;
}

/**
 * This service is the only place in the codebase allowed to see a raw NIN,
 * and it never persists it — only a keyed hash (for duplicate-account
 * detection) and the provider's opaque reference are stored.
 */
@Injectable()
export class IdentityVerificationAppService {
  private readonly logger = new Logger(IdentityVerificationAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @Inject(IDENTITY_VERIFICATION_SERVICE)
    private readonly provider: IdentityVerificationService,
  ) {}

  async initiate(params: InitiateParams) {
    const ninHash = hmacHash(params.nin, this.config.fieldEncryptionKey);

    const duplicate = await this.prisma.identityVerification.findFirst({
      where: { ninHash, status: IdentityVerificationStatus.VERIFIED as any, NOT: { userId: params.userId } },
    });
    if (duplicate) {
      // Do not reveal that this NIN belongs to another account.
      throw new BadRequestException('This identity could not be verified. Please contact support.');
    }

    await this.prisma.consentRecord.create({
      data: {
        userId: params.userId,
        consentType: ConsentType.IDENTITY_VERIFICATION,
        version: '1.0',
        ipAddress: params.ipAddress,
      },
    });

    const record = await this.prisma.identityVerification.create({
      data: {
        userId: params.userId,
        provider: this.config.identityProvider.provider,
        status: IdentityVerificationStatus.PENDING as any,
        ninHash,
        consentedAt: new Date(),
      },
    });

    try {
      const result = await this.provider.verifyNin({
        userId: params.userId,
        nin: params.nin,
        fullNameAsProvided: params.fullName,
        dateOfBirth: params.dateOfBirth,
        consentTimestamp: new Date().toISOString(),
      });

      return this.applyResult(record.id, params.userId, result);
    } catch (error) {
      this.logger.error(
        `Identity verification provider call failed for verification ${record.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.prisma.identityVerification.update({
        where: { id: record.id },
        data: { status: IdentityVerificationStatus.FAILED as any, failureReason: 'Provider unavailable.' },
      });
      throw new BadRequestException(
        'We could not complete identity verification right now. Please try again shortly.',
      );
    }
  }

  private async applyResult(
    verificationId: string,
    userId: string,
    result: Awaited<ReturnType<IdentityVerificationService['verifyNin']>>,
  ) {
    const statusMap: Record<string, IdentityVerificationStatus> = {
      VERIFIED: IdentityVerificationStatus.VERIFIED,
      FAILED: IdentityVerificationStatus.FAILED,
      PENDING: IdentityVerificationStatus.PENDING,
    };
    const status = statusMap[result.outcome];

    const previousAttemptCount = await this.prisma.identityVerificationAttempt.count({
      where: { identityVerificationId: verificationId },
    });
    const attemptNumber = previousAttemptCount + 1;

    await this.prisma.identityVerificationAttempt.create({
      data: {
        identityVerificationId: verificationId,
        attemptNumber,
        status: status as any,
        providerRequestId: result.providerReference,
        failureReason: result.failureReason,
      },
    });

    await this.prisma.identityVerification.update({
      where: { id: verificationId },
      data: {
        status: status as any,
        providerReference: result.providerReference,
        verifiedFullName: result.verifiedFullName,
        failureReason: result.failureReason,
        verifiedAt: status === IdentityVerificationStatus.VERIFIED ? new Date() : undefined,
      },
    });

    if (status === IdentityVerificationStatus.VERIFIED) {
      await this.prisma.passengerProfile.updateMany({
        where: { userId },
        data: { verificationStatus: PassengerVerificationStatus.IDENTITY_VERIFIED as any },
      });
    } else if (status === IdentityVerificationStatus.FAILED) {
      await this.prisma.passengerProfile.updateMany({
        where: { userId },
        data: { verificationStatus: PassengerVerificationStatus.IDENTITY_FAILED as any },
      });
    } else {
      await this.prisma.passengerProfile.updateMany({
        where: { userId },
        data: { verificationStatus: PassengerVerificationStatus.IDENTITY_PENDING as any },
      });
    }

    return {
      status,
      providerReference: result.providerReference,
      failureReason: result.failureReason,
    };
  }

  async getStatus(userId: string) {
    const record = await this.prisma.identityVerification.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, createdAt: true, verifiedAt: true, failureReason: true },
    });
    return record ?? { status: IdentityVerificationStatus.NOT_STARTED };
  }
}
