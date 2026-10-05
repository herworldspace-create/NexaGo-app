import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Field names that must never appear in logs, whatever the context.
 * This list is intentionally conservative — when in doubt, redact.
 */
const SENSITIVE_FIELDS = new Set([
  'nin',
  'nationalIdNumber',
  'password',
  'otp',
  'otpCode',
  'accessToken',
  'refreshToken',
  'authorization',
  'documentImage',
  'selfieImage',
  'idDocumentBase64',
  'cardNumber',
  'bankAccountNumber',
]);

function redact(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(redact);
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = SENSITIVE_FIELDS.has(key) ? '[REDACTED]' : redact(value);
    }
    return out;
  }
  return input;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, body } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${method} ${originalUrl} ${Date.now() - start}ms ${
              body && Object.keys(body).length ? JSON.stringify(redact(body)) : ''
            }`,
          );
        },
        error: () => {
          this.logger.warn(`${method} ${originalUrl} ${Date.now() - start}ms FAILED`);
        },
      }),
    );
  }
}
