import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Role } from '../../common/enums/role.enum';
import { DocumentStatus, DriverVerificationStatus } from '../../common/enums/verification-status.enum';
import { assertValidTransition, canAcceptRides } from '../driver-verification/driver-verification.state-machine';
import { MANDATORY_DRIVER_DOCUMENT_TYPES } from '../driver-verification/mandatory-documents.const';
import { STORAGE_PROVIDER, StorageProvider } from '../documents/storage-provider.interface';
import { ListDriversQueryDto } from './dto/list-drivers-query.dto';

const DOCUMENT_URL_EXPIRY_SECONDS = 300;

@Injectable()
export class AdminDriversService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async list(query: ListDriversQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.status) {
      where.verificationStatus = query.status;
    }
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { licenceNumber: { contains: query.search, mode: 'insensitive' } },
        { user: { phone: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.driverProfile.findMany({
        where: where as any,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          fullName: true,
          verificationStatus: true,
          licenceExpiryDate: true,
          createdAt: true,
          user: { select: { phone: true, status: true } },
        },
      }),
      this.prisma.driverProfile.count({ where: where as any }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getDetail(driverProfileId: string, requestingRole: Role) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      include: {
        user: { select: { id: true, phone: true, status: true, createdAt: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        vehicles: { include: { documents: { orderBy: { createdAt: 'desc' } } } },
      },
    });

    if (!profile) {
      throw new NotFoundException('Driver not found.');
    }

    const identityVerification = await this.prisma.identityVerification.findFirst({
      where: { userId: profile.userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, provider: true, providerReference: true, verifiedFullName: true, verifiedAt: true, failureReason: true },
    });

    const canElevated = requestingRole === Role.SUPER_ADMIN;

    return {
      ...profile,
      canAcceptRides: canAcceptRides(profile.verificationStatus as unknown as DriverVerificationStatus),
      identityVerification: identityVerification
        ? {
            status: identityVerification.status,
            provider: identityVerification.provider,
            verifiedAt: identityVerification.verifiedAt,
            failureReason: identityVerification.failureReason,
            // Masked for regular admins; full detail only for SUPER_ADMIN.
            verifiedFullName: canElevated ? identityVerification.verifiedFullName : this.mask(identityVerification.verifiedFullName),
            providerReference: canElevated ? identityVerification.providerReference : this.mask(identityVerification.providerReference),
          }
        : null,
    };
  }

  async getDocumentSignedUrl(documentId: string) {
    const document = await this.prisma.driverDocument.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException('Document not found.');
    }
    const url = await this.storage.getSignedReadUrl(document.storagePath, DOCUMENT_URL_EXPIRY_SECONDS);
    return { url, expiresInSeconds: DOCUMENT_URL_EXPIRY_SECONDS };
  }

  async approveDocument(documentId: string) {
    const document = await this.prisma.driverDocument.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    if (document.expiryDate && document.expiryDate.getTime() < Date.now()) {
      throw new BadRequestException('Cannot approve a document that has already expired.');
    }

    const updated = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data: { status: DocumentStatus.APPROVED as any, rejectionReason: null, reviewedAt: new Date() },
    });

    await this.maybeAdvancePastDocumentReview(document.driverProfileId);
    return updated;
  }

  async rejectDocument(documentId: string, reason: string) {
    const document = await this.prisma.driverDocument.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    const updated = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data: { status: DocumentStatus.REJECTED as any, rejectionReason: reason, reviewedAt: new Date() },
    });

    const profile = await this.prisma.driverProfile.findUnique({ where: { id: document.driverProfileId } });
    if (profile && profile.verificationStatus === (DriverVerificationStatus.DOCUMENT_REVIEW as any)) {
      assertValidTransition(DriverVerificationStatus.DOCUMENT_REVIEW, DriverVerificationStatus.DOCUMENT_REJECTED);
      await this.prisma.driverProfile.update({
        where: { id: document.driverProfileId },
        data: { verificationStatus: DriverVerificationStatus.DOCUMENT_REJECTED as any },
      });
    }

    return updated;
  }

  /**
   * If every mandatory document type is approved and unexpired, advance the
   * driver from DOCUMENT_REVIEW into ADMIN_REVIEW automatically. This keeps
   * the "all documents ok" check in one place rather than duplicated across
   * every document-approval call site.
   */
  private async maybeAdvancePastDocumentReview(driverProfileId: string): Promise<void> {
    const profile = await this.prisma.driverProfile.findUnique({ where: { id: driverProfileId } });
    if (!profile || profile.verificationStatus !== (DriverVerificationStatus.DOCUMENT_REVIEW as any)) {
      return;
    }

    const documents = await this.prisma.driverDocument.findMany({ where: { driverProfileId } });

    const allMandatorySatisfied = MANDATORY_DRIVER_DOCUMENT_TYPES.every((type) => {
      const doc = documents
        .filter((d) => d.type === (type as any))
        .sort((a, b) => b.version - a.version)[0];
      if (!doc) return false;
      if (doc.status !== (DocumentStatus.APPROVED as any)) return false;
      if (doc.expiryDate && doc.expiryDate.getTime() < Date.now()) return false;
      return true;
    });

    if (allMandatorySatisfied) {
      assertValidTransition(DriverVerificationStatus.DOCUMENT_REVIEW, DriverVerificationStatus.ADMIN_REVIEW);
      await this.prisma.driverProfile.update({
        where: { id: driverProfileId },
        data: { verificationStatus: DriverVerificationStatus.ADMIN_REVIEW as any },
      });
    }
  }

  async markDocumentsPending(driverProfileId: string) {
    const profile = await this.getRequiredProfile(driverProfileId);
    assertValidTransition(
      profile.verificationStatus as unknown as DriverVerificationStatus,
      DriverVerificationStatus.DOCUMENTS_PENDING,
    );
    return this.prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: { verificationStatus: DriverVerificationStatus.DOCUMENTS_PENDING as any },
    });
  }

  async submitForAdminReview(driverProfileId: string) {
    // Manual escalation path (e.g. all documents present but an admin wants
    // to move it into review without waiting for the auto-advance trigger).
    const profile = await this.getRequiredProfile(driverProfileId);
    assertValidTransition(
      profile.verificationStatus as unknown as DriverVerificationStatus,
      DriverVerificationStatus.ADMIN_REVIEW,
    );
    return this.prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: { verificationStatus: DriverVerificationStatus.ADMIN_REVIEW as any },
    });
  }

  async approveDriver(driverProfileId: string) {
    const profile = await this.getRequiredProfile(driverProfileId);
    assertValidTransition(profile.verificationStatus as unknown as DriverVerificationStatus, DriverVerificationStatus.APPROVED);
    return this.prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: { verificationStatus: DriverVerificationStatus.APPROVED as any },
    });
  }

  async activateDriver(driverProfileId: string) {
    const profile = await this.getRequiredProfile(driverProfileId);
    assertValidTransition(profile.verificationStatus as unknown as DriverVerificationStatus, DriverVerificationStatus.ACTIVE);
    return this.prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: { verificationStatus: DriverVerificationStatus.ACTIVE as any },
    });
  }

  async rejectDriver(driverProfileId: string, reason: string) {
    const profile = await this.getRequiredProfile(driverProfileId);
    assertValidTransition(profile.verificationStatus as unknown as DriverVerificationStatus, DriverVerificationStatus.ADMIN_REJECTED);
    // Rejection reason is captured in the audit log via AuditLogInterceptor
    // (request body). If a dedicated visible-to-driver reason field is
    // needed later, add a column rather than overloading this one.
    void reason;
    return this.prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: { verificationStatus: DriverVerificationStatus.ADMIN_REJECTED as any },
    });
  }

  async suspendDriver(driverProfileId: string) {
    const profile = await this.getRequiredProfile(driverProfileId);
    assertValidTransition(profile.verificationStatus as unknown as DriverVerificationStatus, DriverVerificationStatus.SUSPENDED);
    return this.prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: { verificationStatus: DriverVerificationStatus.SUSPENDED as any },
    });
  }

  async reactivateDriver(driverProfileId: string) {
    const profile = await this.getRequiredProfile(driverProfileId);
    assertValidTransition(profile.verificationStatus as unknown as DriverVerificationStatus, DriverVerificationStatus.ACTIVE);
    return this.prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: { verificationStatus: DriverVerificationStatus.ACTIVE as any },
    });
  }

  private async getRequiredProfile(driverProfileId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { id: driverProfileId } });
    if (!profile) {
      throw new NotFoundException('Driver not found.');
    }
    return profile;
  }

  private mask(value?: string | null): string | undefined {
    if (!value) return value ?? undefined;
    if (value.length <= 4) return '****';
    return `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`;
  }
}
