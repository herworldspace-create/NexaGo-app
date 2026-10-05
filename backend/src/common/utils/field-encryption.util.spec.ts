import { randomBytes } from 'crypto';
import { FieldEncryptionService } from './field-encryption.util';
import { AppConfigService } from '../../config/app-config.service';

function buildConfig(key: string): AppConfigService {
  return { fieldEncryptionKey: key } as unknown as AppConfigService;
}

describe('FieldEncryptionService', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips plaintext through encrypt/decrypt', () => {
    const service = new FieldEncryptionService(buildConfig(key));
    const plaintext = 'sensitive-reference-value';
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const service = new FieldEncryptionService(buildConfig(key));
    const a = service.encrypt('same-value');
    const b = service.encrypt('same-value');
    expect(a).not.toBe(b);
  });

  it('throws if the encryption key is not 32 bytes', () => {
    expect(() => new FieldEncryptionService(buildConfig('too-short'))).toThrow();
  });

  it('fails to decrypt if the payload has been tampered with', () => {
    const service = new FieldEncryptionService(buildConfig(key));
    const encrypted = service.encrypt('sensitive-reference-value');
    const [iv, tag, data] = encrypted.split('.');
    const tampered = [iv, tag, Buffer.from('tampered').toString('base64')].join('.');
    expect(() => service.decrypt(tampered)).toThrow();
  });
});
