/**
 * Abstraction over private document storage. Documents (licences, vehicle
 * registration, selfies, etc.) must never be stored in a publicly
 * accessible location. Implementations must return keys/paths, never
 * public URLs — read access is always brokered through
 * `getSignedReadUrl`, which should itself enforce short expiry and
 * (at the call site) role-based authorization.
 */
export interface StoredFileMetadata {
  storagePath: string;
  sizeBytes: number;
  mimeType: string;
}

export interface StorageProvider {
  /** Persists a buffer to private storage and returns its location metadata. */
  store(params: { key: string; buffer: Buffer; mimeType: string }): Promise<StoredFileMetadata>;

  /** Produces a short-lived, access-controlled URL for reading a stored file. */
  getSignedReadUrl(storagePath: string, expirySeconds: number): Promise<string>;

  delete(storagePath: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
