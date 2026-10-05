import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { UserWalletModule } from '../user-wallet/user-wallet.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';
import { PaystackPaymentProvider } from './providers/paystack-payment.provider';

@Module({
  imports: [WalletModule, UserWalletModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaystackPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: PaystackPaymentProvider },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
