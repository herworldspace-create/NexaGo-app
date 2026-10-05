export interface InitializePaymentParams {
  /** Our own Payment.id — used as the gateway's transaction reference. */
  reference: string;
  amountKobo: number;
  currency: string;
  customerEmail: string;
  metadata?: Record<string, unknown>;
}

export interface InitializePaymentResult {
  authorizationUrl: string;
  accessCode?: string;
  providerReference: string;
}

export interface WebhookEvent {
  eventType: string;
  providerReference: string;
  amountKobo: number;
  status: 'success' | 'failed';
  customerEmail?: string;
}

export interface PaymentProvider {
  /** Starts a hosted checkout / charge. Throws if the provider isn't configured or the call fails. */
  initialize(params: InitializePaymentParams): Promise<InitializePaymentResult>;

  /**
   * Verifies a webhook's authenticity using the raw request body and the
   * provider's signature header. MUST be checked before any webhook
   * payload is trusted — this is the entire defense against a forged
   * "payment succeeded" request.
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean;

  /** Parses an already-signature-verified webhook body into a normalized event. */
  parseWebhookEvent(rawBody: string): WebhookEvent;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
