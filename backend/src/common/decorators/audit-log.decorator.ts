import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'auditLog';

export interface AuditLogMetadata {
  /** Short machine-readable action name, e.g. 'DRIVER_DOCUMENT_APPROVED'. */
  action: string;
  /** The entity type being acted on, e.g. 'DriverDocument', 'DriverProfile'. */
  targetType: string;
}

/**
 * Marks an admin route handler for automatic audit logging via
 * AuditLogInterceptor. The target id is taken from the route's `:id`
 * param by default; override by having the handler return an object
 * containing an `id` field if the acted-on entity differs from the route
 * param (the interceptor prefers the response id when present).
 */
export const AuditLog = (metadata: AuditLogMetadata) => SetMetadata(AUDIT_LOG_KEY, metadata);
