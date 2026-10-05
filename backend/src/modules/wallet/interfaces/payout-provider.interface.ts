export interface PayoutRequest {
  withdrawalId: string;
  amountKobo: number;
  currency: string;
  /** Opaque reference to a bank-account-linking record from a future phase. */
  payoutAccountReference: string;
}

export interface PayoutResult {
  providerReference: string;
}

export interface PayoutProvider {
  payout(request: PayoutRequest): Promise<PayoutResult>;
}

export const PAYOUT_PROVIDER = Symbol('PAYOUT_PROVIDER');
