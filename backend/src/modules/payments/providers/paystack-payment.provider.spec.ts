import { createHmac } from 'crypto';
import { PaystackPaymentProvider } from './paystack-payment.provider';
import { AppConfigService } from '../../../config/app-config.service';

function buildConfig(webhookSecret?: string): AppConfigService {
  return { paystack: { secretKey: 'sk_test_x', webhookSecret } } as unknown as AppConfigService;
}

describe('PaystackPaymentProvider', () => {
  describe('verifyWebhookSignature', () => {
    const secret = 'whsec_test';
    const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'abc', amount: 1000 } });

    it('accepts a correctly-signed payload', () => {
      const provider = new PaystackPaymentProvider(buildConfig(secret));
      const validSignature = createHmac('sha512', secret).update(rawBody).digest('hex');

      expect(provider.verifyWebhookSignature(rawBody, validSignature)).toBe(true);
    });

    it('rejects a payload signed with the wrong secret', () => {
      const provider = new PaystackPaymentProvider(buildConfig(secret));
      const wrongSignature = createHmac('sha512', 'a-different-secret').update(rawBody).digest('hex');

      expect(provider.verifyWebhookSignature(rawBody, wrongSignature)).toBe(false);
    });

    it('rejects a tampered body even with a signature computed for the original body', () => {
      const provider = new PaystackPaymentProvider(buildConfig(secret));
      const originalSignature = createHmac('sha512', secret).update(rawBody).digest('hex');
      const tamperedBody = JSON.stringify({ event: 'charge.success', data: { reference: 'abc', amount: 999999 } });

      expect(provider.verifyWebhookSignature(tamperedBody, originalSignature)).toBe(false);
    });

    it('rejects when there is no signature header at all', () => {
      const provider = new PaystackPaymentProvider(buildConfig(secret));
      expect(provider.verifyWebhookSignature(rawBody, undefined)).toBe(false);
    });

    it('rejects when the webhook secret is not configured', () => {
      const provider = new PaystackPaymentProvider(buildConfig(undefined));
      const someSignature = createHmac('sha512', 'irrelevant').update(rawBody).digest('hex');
      expect(provider.verifyWebhookSignature(rawBody, someSignature)).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('parses a successful charge event', () => {
      const provider = new PaystackPaymentProvider(buildConfig('secret'));
      const rawBody = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref-123', amount: 150_000, status: 'success', customer: { email: 'a@b.com' } },
      });

      const result = provider.parseWebhookEvent(rawBody);

      expect(result).toEqual({
        eventType: 'charge.success',
        providerReference: 'ref-123',
        amountKobo: 150_000,
        status: 'success',
        customerEmail: 'a@b.com',
      });
    });

    it('parses a failed charge event', () => {
      const provider = new PaystackPaymentProvider(buildConfig('secret'));
      const rawBody = JSON.stringify({
        event: 'charge.failed',
        data: { reference: 'ref-456', amount: 50_000, status: 'failed' },
      });

      const result = provider.parseWebhookEvent(rawBody);
      expect(result.status).toBe('failed');
      expect(result.providerReference).toBe('ref-456');
    });

    it('treats any non-"success" status string as failed (fails closed)', () => {
      const provider = new PaystackPaymentProvider(buildConfig('secret'));
      const rawBody = JSON.stringify({
        event: 'charge.something_unexpected',
        data: { reference: 'ref-789', amount: 1000, status: 'abandoned' },
      });

      expect(provider.parseWebhookEvent(rawBody).status).toBe('failed');
    });
  });
});
