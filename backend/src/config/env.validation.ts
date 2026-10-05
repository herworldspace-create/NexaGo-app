import { z } from 'zod';

/**
 * All environment configuration is validated at boot time.
 * If required variables are missing or malformed, the app refuses to start
 * rather than running with undefined/insecure defaults.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api/v1'),
  CORS_ALLOWED_ORIGINS: z.string().default(''),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  OTP_PROVIDER: z.enum(['console', 'sms']).default('console'),
  OTP_CODE_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(60),

  SMS_PROVIDER_API_KEY: z.string().optional(),
  SMS_PROVIDER_SENDER_ID: z.string().default('NEXA'),

  IDENTITY_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  IDENTITY_PROVIDER_BASE_URL: z.string().optional(),
  IDENTITY_PROVIDER_API_KEY: z.string().optional(),
  IDENTITY_PROVIDER_CLIENT_ID: z.string().optional(),
  IDENTITY_PROVIDER_WEBHOOK_SECRET: z.string().optional(),

  FIELD_ENCRYPTION_KEY: z
    .string()
    .min(1, 'FIELD_ENCRYPTION_KEY is required for encrypting sensitive fields'),

  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  STORAGE_BUCKET_NAME: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),

  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),

  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),

  ROUTE_PROVIDER: z.enum(['mock', 'mapbox']).default('mock'),
  MAPBOX_ACCESS_TOKEN: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  if (result.data.NODE_ENV === 'production' && result.data.IDENTITY_PROVIDER === 'mock') {
    throw new Error(
      'IDENTITY_PROVIDER cannot be "mock" in production. Configure an authorized ' +
        'identity verification provider before deploying.',
    );
  }

  if (result.data.NODE_ENV === 'production' && result.data.OTP_PROVIDER === 'console') {
    throw new Error(
      'OTP_PROVIDER cannot be "console" in production. Configure a real SMS provider.',
    );
  }

  if (result.data.NODE_ENV === 'production' && result.data.ROUTE_PROVIDER === 'mock') {
    throw new Error(
      'ROUTE_PROVIDER cannot be "mock" in production — straight-line distance estimates ' +
        'would materially mis-price every fixed-price fare quote. Configure Mapbox or another real routing provider.',
    );
  }

  return result.data;
}
