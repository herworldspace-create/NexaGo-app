import { BadRequestException } from '@nestjs/common';
import { AdminDriversService } from './admin-drivers.service';
import { DocumentStatus, DriverDocumentType, DriverVerificationStatus } from '../../common/enums/verification-status.enum';
import { Role } from '../../common/enums/role.enum';
import { PrismaService } from '../../config/prisma.service';
import { StorageProvider } from '../documents/storage-provider.interface';

function buildDoc(type: DriverDocumentType, status: DocumentStatus, expiryDate: Date | null = null) {
  return { type, status, expiryDate, version: 1 };
}

function buildPrismaMock() {
  return {
    driverDocument: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    driverProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    identityVerification: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

const storageMock: jest.Mocked<StorageProvider> = {
  store: jest.fn(),
  getSignedReadUrl: jest.fn().mockResolvedValue('https://example.com/signed'),
  delete: jest.fn(),
};

describe('AdminDriversService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: AdminDriversService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new AdminDriversService(prisma as unknown as PrismaService, storageMock);
  });

  describe('approveDocument', () => {
    it('rejects approving an already-expired document', async () => {
      prisma.driverDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        driverProfileId: 'driver-1',
        expiryDate: new Date(Date.now() - 1000),
      });

      await expect(service.approveDocument('doc-1')).rejects.toThrow(BadRequestException);
      expect(prisma.driverDocument.update).not.toHaveBeenCalled();
    });

    it('advances the driver to ADMIN_REVIEW once all mandatory documents are approved', async () => {
      prisma.driverDocument.findUnique.mockResolvedValue({
        id: 'doc-last',
        driverProfileId: 'driver-1',
        expiryDate: null,
      });
      prisma.driverDocument.update.mockResolvedValue({ id: 'doc-last', status: DocumentStatus.APPROVED });

      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-1',
        verificationStatus: DriverVerificationStatus.DOCUMENT_REVIEW,
      });

      prisma.driverDocument.findMany.mockResolvedValue([
        buildDoc(DriverDocumentType.DRIVERS_LICENCE, DocumentStatus.APPROVED),
        buildDoc(DriverDocumentType.VEHICLE_REGISTRATION, DocumentStatus.APPROVED),
        buildDoc(DriverDocumentType.VEHICLE_INSURANCE, DocumentStatus.APPROVED),
        buildDoc(DriverDocumentType.ROADWORTHINESS_CERTIFICATE, DocumentStatus.APPROVED),
      ]);

      prisma.driverProfile.update.mockResolvedValue({});

      await service.approveDocument('doc-last');

      expect(prisma.driverProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { verificationStatus: DriverVerificationStatus.ADMIN_REVIEW },
        }),
      );
    });

    it('does NOT advance the driver while a mandatory document is still missing', async () => {
      prisma.driverDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        driverProfileId: 'driver-1',
        expiryDate: null,
      });
      prisma.driverDocument.update.mockResolvedValue({});

      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-1',
        verificationStatus: DriverVerificationStatus.DOCUMENT_REVIEW,
      });

      prisma.driverDocument.findMany.mockResolvedValue([
        buildDoc(DriverDocumentType.DRIVERS_LICENCE, DocumentStatus.APPROVED),
        buildDoc(DriverDocumentType.VEHICLE_REGISTRATION, DocumentStatus.PENDING_REVIEW),
      ]);

      await service.approveDocument('doc-1');

      expect(prisma.driverProfile.update).not.toHaveBeenCalled();
    });

    it('does NOT advance the driver if an approved mandatory document has expired', async () => {
      prisma.driverDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        driverProfileId: 'driver-1',
        expiryDate: null,
      });
      prisma.driverDocument.update.mockResolvedValue({});

      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-1',
        verificationStatus: DriverVerificationStatus.DOCUMENT_REVIEW,
      });

      prisma.driverDocument.findMany.mockResolvedValue([
        buildDoc(DriverDocumentType.DRIVERS_LICENCE, DocumentStatus.APPROVED, new Date(Date.now() - 1000)),
        buildDoc(DriverDocumentType.VEHICLE_REGISTRATION, DocumentStatus.APPROVED),
        buildDoc(DriverDocumentType.VEHICLE_INSURANCE, DocumentStatus.APPROVED),
        buildDoc(DriverDocumentType.ROADWORTHINESS_CERTIFICATE, DocumentStatus.APPROVED),
      ]);

      await service.approveDocument('doc-1');

      expect(prisma.driverProfile.update).not.toHaveBeenCalled();
    });
  });

  describe('rejectDocument', () => {
    it('moves the driver to DOCUMENT_REJECTED when currently in DOCUMENT_REVIEW', async () => {
      prisma.driverDocument.findUnique.mockResolvedValue({ id: 'doc-1', driverProfileId: 'driver-1' });
      prisma.driverDocument.update.mockResolvedValue({});
      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-1',
        verificationStatus: DriverVerificationStatus.DOCUMENT_REVIEW,
      });
      prisma.driverProfile.update.mockResolvedValue({});

      await service.rejectDocument('doc-1', 'Blurry photo, please resubmit.');

      expect(prisma.driverProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { verificationStatus: DriverVerificationStatus.DOCUMENT_REJECTED },
        }),
      );
    });
  });

  describe('getDetail — sensitive data masking', () => {
    it('masks identity verification detail for a regular ADMIN', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-1',
        userId: 'user-1',
        documents: [],
        vehicles: [],
        verificationStatus: DriverVerificationStatus.ACTIVE,
      });
      prisma.identityVerification.findFirst.mockResolvedValue({
        status: 'VERIFIED',
        provider: 'mock',
        providerReference: 'MOCK-1234567890',
        verifiedFullName: 'Ada Lovelace',
        verifiedAt: new Date(),
        failureReason: null,
      });

      const detail = await service.getDetail('driver-1', Role.ADMIN);

      expect(detail.identityVerification?.verifiedFullName).not.toBe('Ada Lovelace');
      expect(detail.identityVerification?.verifiedFullName).toContain('*');
      expect(detail.identityVerification?.providerReference).toContain('*');
    });

    it('shows full identity verification detail for SUPER_ADMIN', async () => {
      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-1',
        userId: 'user-1',
        documents: [],
        vehicles: [],
        verificationStatus: DriverVerificationStatus.ACTIVE,
      });
      prisma.identityVerification.findFirst.mockResolvedValue({
        status: 'VERIFIED',
        provider: 'mock',
        providerReference: 'MOCK-1234567890',
        verifiedFullName: 'Ada Lovelace',
        verifiedAt: new Date(),
        failureReason: null,
      });

      const detail = await service.getDetail('driver-1', Role.SUPER_ADMIN);

      expect(detail.identityVerification?.verifiedFullName).toBe('Ada Lovelace');
      expect(detail.identityVerification?.providerReference).toBe('MOCK-1234567890');
    });
  });
});
