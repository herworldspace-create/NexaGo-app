import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AppConfigService } from '../../config/app-config.service';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

/**
 * Field-level encryption for sensitive data that must be retained
 * (e.g. an encrypted reference to a verified document ID). This is NOT
 * used for values we can avoid storing at all — data minimization comes
 * first; encryption is the second line of defense for what remains.
 *
 * Output format: base64(iv) + '.' + base64(authTag) + '.' + base64(ciphertext)
 */
@Injectable()
export class FieldEncryptionService {
  private readonly key: Buffer;

  constructor(config: AppConfigService) {
    const keyB64 = config.fieldEncryptionKey;
    const key = Buffer.from(keyB64, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256). ' +
          'Generate one with: openssl rand -base64 32',
      );
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(
      '.',
    );
  }

  decrypt(payload: string): string {
    const [ivB64, authTagB64, dataB64] = payload.split('.');
    if (!ivB64 || !authTagB64 || !dataB64) {
      throw new Error('Malformed encrypted payload.');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
