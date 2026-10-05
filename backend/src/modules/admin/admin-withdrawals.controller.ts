import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { IsOptional, IsEnum } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { Role } from '../../common/enums/role.enum';
import { WithdrawalStatus } from '../../common/enums/payment.enum';
import { WalletService } from '../wallet/wallet.service';
import { ResolveWithdrawalDto } from './dto/resolve-withdrawal.dto';

class ListWithdrawalsQueryDto {
  @IsOptional()
  @IsEnum(WithdrawalStatus)
  status?: WithdrawalStatus;
}

@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/withdrawals')
export class AdminWithdrawalsController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async list(@Query() query: ListWithdrawalsQueryDto) {
    return this.walletService.listAllWithdrawals(query.status);
  }

  @Post(':id/complete')
  @AuditLog({ action: 'WITHDRAWAL_COMPLETED', targetType: 'Withdrawal' })
  async complete(@Param('id') id: string) {
    return this.walletService.resolveWithdrawal(id, 'COMPLETED');
  }

  @Post(':id/fail')
  @AuditLog({ action: 'WITHDRAWAL_FAILED', targetType: 'Withdrawal' })
  async fail(@Param('id') id: string, @Body() dto: ResolveWithdrawalDto) {
    return this.walletService.resolveWithdrawal(id, 'FAILED', dto.reason);
  }

  @Post(':id/reject')
  @AuditLog({ action: 'WITHDRAWAL_REJECTED', targetType: 'Withdrawal' })
  async reject(@Param('id') id: string, @Body() dto: ResolveWithdrawalDto) {
    return this.walletService.resolveWithdrawal(id, 'REJECTED', dto.reason);
  }
}
