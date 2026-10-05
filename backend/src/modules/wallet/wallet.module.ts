import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { PAYOUT_PROVIDER } from './interfaces/payout-provider.interface';
import { PaystackPayoutProvider } from './providers/paystack-payout.provider';

@Module({
  controllers: [WalletController],
  providers: [
    WalletService,
    PaystackPayoutProvider,
    { provide: PAYOUT_PROVIDER, useExisting: PaystackPayoutProvider },
  ],
  exports: [WalletService],
})
export class WalletModule {}
