import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from './env.validation';

/**
 * Thin, typed wrapper around Nest's ConfigService so the rest of the app
 * never reads `process.env` directly and never has to guess a key name.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  get isProduction(): boolean {
    return this.configService.get('NODE_ENV', { infer: true }) === 'production';
  }

  get port(): number {
    return this.configService.get('PORT', { infer: true });
  }

  get apiPrefix(): string {
    return this.configService.get('API_PREFIX', { infer: true });
  }

  get corsAllowedOrigins(): string[] {
    const raw = this.configService.get('CORS_ALLOWED_ORIGINS', { infer: true });
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get databaseUrl(): string {
    return this.configService.get('DATABASE_URL', { infer: true });
  }

  get jwt() {
    return {
      accessSecret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
      accessExpiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', { infer: true }),
      refreshSecret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
      refreshExpiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', { infer: true }),
    };
  }

  get otp() {
    return {
      provider: this.configService.get('OTP_PROVIDER', { infer: true }),
      codeLength: this.configService.get('OTP_CODE_LENGTH', { infer: true }),
      ttlSeconds: this.configService.get('OTP_TTL_SECONDS', { infer: true }),
      maxAttempts: this.configService.get('OTP_MAX_ATTEMPTS', { infer: true }),
      resendCooldownSeconds: this.configService.get('OTP_RESEND_COOLDOWN_SECONDS', {
        infer: true,
      }),
    };
  }

  get identityProvider() {
    return {
      provider: this.configService.get('IDENTITY_PROVIDER', { infer: true }),
      baseUrl: this.configService.get('IDENTITY_PROVIDER_BASE_URL', { infer: true }),
      apiKey: this.configService.get('IDENTITY_PROVIDER_API_KEY', { infer: true }),
      clientId: this.configService.get('IDENTITY_PROVIDER_CLIENT_ID', { infer: true }),
      webhookSecret: this.configService.get('IDENTITY_PROVIDER_WEBHOOK_SECRET', {
        infer: true,
      }),
    };
  }

  get fieldEncryptionKey(): string {
    return this.configService.get('FIELD_ENCRYPTION_KEY', { infer: true });
  }

  get storage() {
    return {
      provider: this.configService.get('STORAGE_PROVIDER', { infer: true }),
      localPath: this.configService.get('STORAGE_LOCAL_PATH', { infer: true }),
      bucketName: this.configService.get('STORAGE_BUCKET_NAME', { infer: true }),
      region: this.configService.get('STORAGE_REGION', { infer: true }),
    };
  }

  get throttle() {
    return {
      ttlSeconds: this.configService.get('THROTTLE_TTL_SECONDS', { infer: true }),
      limit: this.configService.get('THROTTLE_LIMIT', { infer: true }),
    };
  }

  get paystack() {
    return {
      secretKey: this.configService.get('PAYSTACK_SECRET_KEY', { infer: true }),
      publicKey: this.configService.get('PAYSTACK_PUBLIC_KEY', { infer: true }),
      webhookSecret: this.configService.get('PAYSTACK_WEBHOOK_SECRET', { infer: true }),
    };
  }

  get fcm() {
    return {
      projectId: this.configService.get('FCM_PROJECT_ID', { infer: true }),
      clientEmail: this.configService.get('FCM_CLIENT_EMAIL', { infer: true }),
      // Service account keys from env files/dashboards commonly have their
      // newlines escaped as literal "\n" — normalize back to real newlines.
      privateKey: this.configService.get('FCM_PRIVATE_KEY', { infer: true })?.replace(/\\n/g, '\n'),
    };
  }

  get route() {
    return {
      provider: this.configService.get('ROUTE_PROVIDER', { infer: true }),
      mapboxAccessToken: this.configService.get('MAPBOX_ACCESS_TOKEN', { infer: true }),
    };
  }
}
