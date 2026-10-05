import { NetworkProvider } from '../../../common/enums/user-wallet.enum';

export interface AirtimePurchaseParams {
  network: NetworkProvider;
  phoneNumber: string;
  amountKobo: number;
  /** Our own VtuOrder.id, used as the idempotency/reference key with the aggregator. */
  reference: string;
}

export interface DataBundle {
  code: string;
  name: string;
  priceKobo: number;
  validity: string;
}

export interface DataPurchaseParams {
  network: NetworkProvider;
  phoneNumber: string;
  bundleCode: string;
  reference: string;
}

export interface VtuPurchaseResult {
  status: 'successful' | 'failed' | 'pending';
  providerReference: string;
  failureReason?: string;
}

export interface VtuProvider {
  purchaseAirtime(params: AirtimePurchaseParams): Promise<VtuPurchaseResult>;
  purchaseData(params: DataPurchaseParams): Promise<VtuPurchaseResult>;
  listDataBundles(network: NetworkProvider): Promise<DataBundle[]>;
}

export const VTU_PROVIDER = Symbol('VTU_PROVIDER');
