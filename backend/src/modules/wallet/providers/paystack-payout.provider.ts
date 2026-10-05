import { Injectable } from '@nestjs/common';
import { PayoutProvider, PayoutRequest, PayoutResult } from '../interfaces/payout-provider.interface';

/**
 * NOT IMPLEMENTED. Actually moving money to a driver's bank account
 * requires, at minimum: a bank-account-linking/verification flow, Paystack
 * Transfer Recipient creation, and OTP-based transfer finalization — a
 * meaningfully larger scope than this phase covers. This stub exists so
 * `WalletService.requestWithdrawal` has something to depend on and the
 * withdrawal *request* bookkeeping (debit the wallet, record the request)
 * can be built and tested now, without pretending money actually moves.
 *
 * To implement: integrate Paystack's Transfer Recipient + Transfer APIs
 * (or Flutterwave's equivalent), and add a driver bank-account-linking
 * flow before this can be wired up for real.
 */
@Injectable()
export class PaystackPayoutProvider implements PayoutProvider {
  async payout(_request: PayoutRequest): Promise<PayoutResult> {
    throw new Error(
      'PaystackPayoutProvider is not yet implemented. Withdrawal requests are recorded ' +
        '(wallet debited, Withdrawal row created) but no real transfer is initiated. ' +
        'Implement bank-account linking and Paystack Transfer Recipients before enabling payouts.',
    );
  }
}
