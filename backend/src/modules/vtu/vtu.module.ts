import { Module } from '@nestjs/common';
import { UserWalletModule } from '../user-wallet/user-wallet.module';
import { VtuController } from './vtu.controller';
import { VtuService } from './vtu.service';
import { VTU_PROVIDER } from './interfaces/vtu-provider.interface';
import { UnconfiguredVtuProvider } from './providers/unconfigured-vtu.provider';

@Module({
  imports: [UserWalletModule],
  controllers: [VtuController],
  providers: [
    VtuService,
    UnconfiguredVtuProvider,
    { provide: VTU_PROVIDER, useExisting: UnconfiguredVtuProvider },
  ],
  exports: [VtuService],
})
export class VtuModule {}
