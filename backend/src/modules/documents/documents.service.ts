import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { DocumentStatus, DriverDocumentType } from '../../common/enums/verification-status.enum';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
  STORAGE_PROVIDER,
  StorageProvider,
} from './storage-provider.interface';

interface UploadDriverDocumentParams {
  userId: string;
  type: DriverDocumentType;
  buffer: Buffer;
  mimeType: string;
  expiryDate?: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async uploadDriverDocument(params: UploadDriverDocumentParams) {
    this.validateFile(params.buffer, params.mimeType);

    const driverProfile = await this.prisma.driverProfile.findUnique({ where: { userId: params.userId } });
    if (!driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }

    const key = `drivers/${driverProfile.id}/${params.type.toLowerCase()}/${randomUUID()}`;
    const stored = await this.storage.store({ key, buffer: params.buffer, mimeType: params.mimeType });

    // Superseding: mark any previous document of the same type as replaced.
    await this.prisma.driverDocument.updateMany({
      where: { driverProfileId: driverProfile.id, type: params.type, status: { not: DocumentStatus.SUPERSEDED as any } },
      data: { status: DocumentStatus.SUPERSEDED as any },
    });

    const previousCount = await this.prisma.driverDocument.count({
      where: { driverProfileId: driverProfile.id, type: params.type },
    });

    return this.prisma.driverDocument.create({
      data: {
        driverProfileId: driverProfile.id,
        type: params.type,
        storagePath: stored.storagePath,
        status: DocumentStatus.PENDING_REVIEW as any,
        expiryDate: params.expiryDate ? new Date(params.expiryDate) : undefined,
        version: previousCount + 1,
      },
    });
  }

  async listDriverDocuments(userId: string) {
    const driverProfile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }
    return this.prisma.driverDocument.findMany({
      where: { driverProfileId: driverProfile.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  private validateFile(buffer: Buffer, mimeType: string): void {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException('Unsupported file type. Please upload a JPEG, PNG, or PDF.');
    }
    if (buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException('File is too large. Maximum size is 10MB.');
    }
    if (buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty.');
    }
  }
}
