import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { DocumentStatus, DriverVerificationStatus } from '../../common/enums/verification-status.enum';
import { assertValidTransition, canAcceptRides } from './driver-verification.state-machine';
import { MANDATORY_DRIVER_DOCUMENT_TYPES } from './mandatory-documents.const';

interface SubmitProfileParams {
  userId: string;
  fullName: string;
  dateOfBirth: string;
  licenceNumber: string;
  licenceExpiryDate: string;
}

@Injectable()
export class DriverVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async submitProfile(params: SubmitProfileParams) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId: params.userId } });
    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    if (profile.verificationStatus !== (DriverVerificationStatus.DRAFT as any)) {
      throw new BadRequestException('Driver profile has already been submitted.');
    }

    assertValidTransition(DriverVerificationStatus.DRAFT, DriverVerificationStatus.SUBMITTED);

    return this.prisma.driverProfile.update({
      where: { userId: params.userId },
      data: {
        fullName: params.fullName,
        dateOfBirth: new Date(params.dateOfBirth),
        licenceNumber: params.licenceNumber,
        licenceExpiryDate: new Date(params.licenceExpiryDate),
        verificationStatus: DriverVerificationStatus.SUBMITTED as any,
      },
    });
  }

  async transition(userId: string, to: DriverVerificationStatus) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    assertValidTransition(profile.verificationStatus as unknown as DriverVerificationStatus, to);

    return this.prisma.driverProfile.update({
      where: { userId },
      data: { verificationStatus: to as any },
    });
  }

  async getStatus(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }
    return {
      status: profile.verificationStatus,
      canAcceptRides: canAcceptRides(profile.verificationStatus as unknown as DriverVerificationStatus),
    };
  }

  /**
   * The single server-side source of truth for "is this driver allowed to
   * go online / accept a ride". It checks not just the coarse
   * verification status but also licence expiry and every mandatory
   * document's approval/expiry — a document expiring after activation
   * immediately makes the driver ineligible again, without requiring an
   * admin to manually change the status. The ride-matching service MUST
   * call this rather than trusting any client-supplied status.
   */
  async assertCanAcceptRides(userId: string): Promise<void> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId },
      include: { documents: true },
    });

    if (!profile || !canAcceptRides(profile.verificationStatus as unknown as DriverVerificationStatus)) {
      throw new BadRequestException('Driver is not eligible to accept rides at this time.');
    }

    if (profile.licenceExpiryDate && profile.licenceExpiryDate.getTime() < Date.now()) {
      throw new BadRequestException('Driver licence has expired.');
    }

    const allMandatorySatisfied = MANDATORY_DRIVER_DOCUMENT_TYPES.every((type) => {
      const latest = profile.documents
        .filter((d) => d.type === (type as any))
        .sort((a, b) => b.version - a.version)[0];
      if (!latest) return false;
      if (latest.status !== (DocumentStatus.APPROVED as any)) return false;
      if (latest.expiryDate && latest.expiryDate.getTime() < Date.now()) return false;
      return true;
    });

    if (!allMandatorySatisfied) {
      throw new BadRequestException('One or more mandatory documents are missing, unapproved, or expired.');
    }
  }
}
