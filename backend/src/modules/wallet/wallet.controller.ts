import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { WalletService } from './wallet.service';
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto';

@Roles(Role.DRIVER)
@Controller('drivers/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getWallet(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getWalletForUser(user.userId);
  }

  @Post('withdrawals')
  async requestWithdrawal(@Body() dto: RequestWithdrawalDto, @CurrentUser() user: AuthenticatedUser) {
    return this.walletService.requestWithdrawal(user.userId, dto.amountKobo, dto.payoutAccountReference);
  }

  @Get('withdrawals')
  async listWithdrawals(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.listWithdrawals(user.userId);
  }
}
