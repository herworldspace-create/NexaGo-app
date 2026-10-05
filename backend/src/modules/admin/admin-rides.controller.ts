import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AdminRidesService } from './admin-rides.service';
import { ListRidesQueryDto } from './dto/list-rides-query.dto';
import { AdminCancelRideDto } from './dto/admin-cancel-ride.dto';

@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/rides')
export class AdminRidesController {
  constructor(private readonly service: AdminRidesService) {}

  @Get('live')
  async live() {
    return this.service.listLive();
  }

  @Get()
  async list(@Query() query: ListRidesQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @AuditLog({ action: 'RIDE_VIEWED', targetType: 'Ride' })
  async getDetail(@Param('id') id: string) {
    return this.service.getDetail(id);
  }

  @Post(':id/cancel')
  @AuditLog({ action: 'RIDE_CANCELLED_BY_ADMIN', targetType: 'Ride' })
  async cancel(@Param('id') id: string, @Body() dto: AdminCancelRideDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.service.cancel(id, admin.userId, dto.reason);
  }
}
