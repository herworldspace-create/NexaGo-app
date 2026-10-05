import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { Role } from '../../common/enums/role.enum';
import { AdminPaymentsService } from './admin-payments.service';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';

@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly service: AdminPaymentsService) {}

  @Get()
  async list(@Query() query: ListPaymentsQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @AuditLog({ action: 'PAYMENT_VIEWED', targetType: 'Payment' })
  async getDetail(@Param('id') id: string) {
    return this.service.getDetail(id);
  }

  @Post(':id/refund')
  @AuditLog({ action: 'PAYMENT_MARKED_REFUNDED', targetType: 'Payment' })
  async refund(@Param('id') id: string, @Body() dto: RefundPaymentDto) {
    return this.service.markRefunded(id, dto.reason);
  }
}
