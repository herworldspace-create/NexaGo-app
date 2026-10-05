import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { Role } from '../../common/enums/role.enum';
import { AdminPassengersService } from './admin-passengers.service';
import { ListPassengersQueryDto } from './dto/list-passengers-query.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';

@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/passengers')
export class AdminPassengersController {
  constructor(private readonly service: AdminPassengersService) {}

  @Get()
  async list(@Query() query: ListPassengersQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @AuditLog({ action: 'PASSENGER_PROFILE_VIEWED', targetType: 'PassengerProfile' })
  async getDetail(@Param('id') id: string) {
    return this.service.getDetail(id);
  }

  @Post(':id/suspend')
  @AuditLog({ action: 'PASSENGER_SUSPENDED', targetType: 'PassengerProfile' })
  async suspend(@Param('id') id: string, @Body() _dto: SuspendUserDto) {
    return this.service.suspend(id);
  }

  @Post(':id/activate')
  @AuditLog({ action: 'PASSENGER_ACTIVATED', targetType: 'PassengerProfile' })
  async activate(@Param('id') id: string) {
    return this.service.activate(id);
  }
}
