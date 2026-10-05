import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UserWalletService } from './user-wallet.service';
import { SetTransactionPinDto } from './dto/set-transaction-pin.dto';
import { TransferDto } from './dto/transfer.dto';

@Controller('wallet')
export class UserWalletController {
  constructor(private readonly walletService: UserWalletService) {}

  @Get()
  async getWallet(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getWallet(user.userId);
  }

  @Post('pin')
  async setPin(@Body() dto: SetTransactionPinDto, @CurrentUser() user: AuthenticatedUser) {
    await this.walletService.setTransactionPin(user.userId, dto);
    return { updated: true };
  }

  @Post('transfer')
  async transfer(@Body() dto: TransferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.walletService.transfer(user.userId, dto.recipientPhone, dto.amountKobo, dto.pin, dto.note);
  }
}
