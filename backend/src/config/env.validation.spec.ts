import { validateEnv } from './env.validation';

const baseConfig = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  FIELD_ENCRYPTION_KEY: 'c'.repeat(32),
};

describe('validateEnv provider configuration', () => {
  it('requires all credentials when live identity verification is selected', () => {
    expect(() => validateEnv({ ...baseConfig, IDENTITY_PROVIDER: 'live' })).toThrow(
      /IDENTITY_PROVIDER_BASE_URL/,
    );
  });

  it('rejects production without Paystack server and webhook credentials', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        IDENTITY_PROVIDER: 'live',
        IDENTITY_PROVIDER_BASE_URL: 'https://identity.example.test',
        IDENTITY_PROVIDER_API_KEY: 'test-key',
        IDENTITY_PROVIDER_CLIENT_ID: 'test-client',
        IDENTITY_PROVIDER_WEBHOOK_SECRET: 'test-webhook-secret',
        OTP_PROVIDER: 'sms',
        ROUTE_PROVIDER: 'mapbox',
        SMS_PROVIDER_API_KEY: 'test-sms-key',
        MAPBOX_ACCESS_TOKEN: 'test-mapbox-token',
      }),
    ).toThrow(/PAYSTACK_SECRET_KEY/);
  });

  it('accepts development mode with the documented mock identity provider', () => {
    expect(validateEnv({ ...baseConfig, NODE_ENV: 'development' }).IDENTITY_PROVIDER).toBe('mock');
  });
});
