import { Injectable } from '@nestjs/common';
import {
  AirtimePurchaseParams,
  DataBundle,
  DataPurchaseParams,
  VtuProvider,
  VtuPurchaseResult,
} from '../interfaces/vtu-provider.interface';
import { NetworkProvider } from '../../../common/enums/user-wallet.enum';

/**
 * NOT IMPLEMENTED. Unlike Paystack, Mapbox, and FCM — each named
 * explicitly in earlier phases — no specific VTU aggregator has been
 * chosen here, so (consistent with how the NIN/SMS provider choices were
 * handled) this is an honest stub rather than a guess at one vendor's
 * API. Common licensed Nigerian options: VTpass, Baxi, ClubKonnect,
 * Reloadly (international).
 *
 * To activate:
 *   1. Register with an aggregator and obtain API credentials.
 *   2. Set VTU_PROVIDER_BASE_URL / VTU_PROVIDER_API_KEY in .env.
 *   3. Implement purchaseAirtime/purchaseData/listDataBundles below
 *      against that aggregator's documented API (this is the only file
 *      that should need to change — VtuService already handles wallet
 *      debiting, refund-on-failure, and order record-keeping).
 *
 * `listDataBundles` returns a small placeholder catalog (clearly
 * labeled, not a live price list) so a frontend can be built and tested
 * against realistic response shapes before a real aggregator is wired up.
 */
@Injectable()
export class UnconfiguredVtuProvider implements VtuProvider {
  async purchaseAirtime(_params: AirtimePurchaseParams): Promise<VtuPurchaseResult> {
    throw new Error(
      'No VTU aggregator is configured. Integrate a licensed provider (e.g. VTpass, Baxi, ' +
        'ClubKonnect) in UnconfiguredVtuProvider before enabling airtime purchases.',
    );
  }

  async purchaseData(_params: DataPurchaseParams): Promise<VtuPurchaseResult> {
    throw new Error(
      'No VTU aggregator is configured. Integrate a licensed provider before enabling data purchases.',
    );
  }

  async listDataBundles(network: NetworkProvider): Promise<DataBundle[]> {
    // PLACEHOLDER catalog for building/testing the frontend only — not
    // live pricing. Replace with a real aggregator's bundle listing.
    return [
      { code: `${network}-1GB-30D`, name: '1GB - 30 days', priceKobo: 35_000, validity: '30 days' },
      { code: `${network}-2GB-30D`, name: '2GB - 30 days', priceKobo: 65_000, validity: '30 days' },
      { code: `${network}-5GB-30D`, name: '5GB - 30 days', priceKobo: 150_000, validity: '30 days' },
    ];
  }
}
