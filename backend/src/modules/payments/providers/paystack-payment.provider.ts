import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { AppConfigService } from '../../../config/app-config.service';
import {
  InitializePaymentParams,
  InitializePaymentResult,
  PaymentProvider,
  WebhookEvent,
} from '../interfaces/payment-provider.interface';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Real integration against Paystack's documented API — Paystack is the
 * vendor explicitly named in the project spec (unlike NIN/SMS, where no
 * specific vendor was chosen), so unlike those providers this one is not
 * a stub: `verifyWebhookSignature` and `parseWebhookEvent` are pure
 * crypto/parsing and have been unit-tested. `initialize` makes a real
 * HTTP call and has NOT been exercised against Paystack's live API in
 * this sandbox (no network access, no real credentials) — test it
 * against a real PAYSTACK_SECRET_KEY (Paystack provides test-mode keys)
 * before relying on it in production.
 */
@Injectable()
export class PaystackPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(PaystackPaymentProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async initialize(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const secretKey = this.config.paystack.secretKey;
    if (!secretKey) {
      throw new Error(
        'PAYSTACK_SECRET_KEY is not configured. Set it in .env before initiating card/bank payments.',
      );
    }

    const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference: params.reference,
        amount: params.amountKobo, // Paystack's "amount" is already the lowest currency unit (kobo) — matches our convention exactly.
        currency: params.currency,
        email: params.customerEmail,
        metadata: params.metadata,
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok || !body?.status) {
      this.logger.error(`Paystack initialize failed: ${response.status} ${JSON.stringify(body)}`);
      throw new Error(body?.message ?? 'Failed to initialize payment with Paystack.');
    }

    return {
      authorizationUrl: body.data.authorization_url,
      accessCode: body.data.access_code,
      providerReference: body.data.reference,
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    const webhookSecret = this.config.paystack.webhookSecret;
    if (!webhookSecret || !signatureHeader) {
      return false;
    }

    const expected = createHmac('sha512', webhookSecret).update(rawBody).digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(signatureHeader, 'utf8');
    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, providedBuf);
  }

  parseWebhookEvent(rawBody: string): WebhookEvent {
    const parsed = JSON.parse(rawBody);
    const data = parsed?.data ?? {};

    const statusRaw: string = data.status ?? '';
    const status: WebhookEvent['status'] = statusRaw === 'success' ? 'success' : 'failed';

    return {
      eventType: parsed?.event ?? 'unknown',
      providerReference: data.reference,
      amountKobo: Number(data.amount),
      status,
      customerEmail: data.customer?.email,
    };
  }
}
