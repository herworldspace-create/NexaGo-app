import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../config/prisma.service';
import { AUDIT_LOG_KEY, AuditLogMetadata } from '../decorators/audit-log.decorator';
import { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type';

const SENSITIVE_KEYS = new Set([
  'nin',
  'password',
  'otp',
  'otpCode',
  'accessToken',
  'refreshToken',
  'documentImage',
  'selfieImage',
]);

function sanitize(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(sanitize);
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? '[REDACTED]' : sanitize(v);
    }
    return out;
  }
  return input;
}

/**
 * Applied to admin controllers/routes. Any handler decorated with
 * @AuditLog(...) automatically gets a corresponding AdminAuditLog row
 * written after a successful response — so audit coverage does not depend
 * on every handler remembering to call the audit service manually.
 *
 * Failed requests (thrown exceptions) are not logged here; they are
 * already captured by application-level error logging.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditLogMetadata | undefined>(AUDIT_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const adminUser = request.user as AuthenticatedUser | undefined;
    const routeTargetId: string | undefined = request.params?.id;
    const requestBody = sanitize(request.body);

    return next.handle().pipe(
      tap((response) => {
        if (!adminUser) return; // Should be unreachable behind JwtAuthGuard, but never log without an actor.

        const responseId =
          response && typeof response === 'object' && 'id' in (response as Record<string, unknown>)
            ? String((response as Record<string, unknown>).id)
            : undefined;

        void this.prisma.adminAuditLog.create({
          data: {
            adminUserId: adminUser.userId,
            action: metadata.action,
            targetType: metadata.targetType,
            targetId: responseId ?? routeTargetId ?? null,
            metadata: { requestBody, responseSummary: sanitize(response) } as any,
          },
        });
      }),
    );
  }
}
