import { Injectable } from '@nestjs/common';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join, dirname, normalize, isAbsolute } from 'path';
import { AppConfigService } from '../../../config/app-config.service';
import { StorageProvider, StoredFileMetadata } from '../storage-provider.interface';

/**
 * Stores files on the local filesystem, outside of any web-served
 * directory. Suitable for local development only — production should use
 * private, access-controlled object storage (e.g. an S3-compatible
 * bucket with no public bucket policy) via an S3StorageProvider
 * implementing the same interface.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly config: AppConfigService) {}

  async store(params: { key: string; buffer: Buffer; mimeType: string }): Promise<StoredFileMetadata> {
    const safeKey = this.sanitizeKey(params.key);
    const fullPath = join(process.cwd(), this.config.storage.localPath, safeKey);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, params.buffer);
    return { storagePath: safeKey, sizeBytes: params.buffer.length, mimeType: params.mimeType };
  }

  async getSignedReadUrl(storagePath: string, _expirySeconds: number): Promise<string> {
    // Local dev stand-in: not a real signed URL. Never expose this scheme
    // publicly; production must use provider-native short-lived URLs.
    return `local://uploads/${this.sanitizeKey(storagePath)}`;
  }

  async delete(storagePath: string): Promise<void> {
    const safeKey = this.sanitizeKey(storagePath);
    const fullPath = join(process.cwd(), 'uploads', safeKey);
    await unlink(fullPath).catch(() => undefined);
  }

  private sanitizeKey(key: string): string {
    const normalized = normalize(key).replace(/^(\.\.[/\\])+/, '');
    if (isAbsolute(normalized) || normalized.includes('..')) {
      throw new Error('Invalid storage key.');
    }
    return normalized;
  }
}
