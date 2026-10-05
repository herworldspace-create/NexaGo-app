import { Body, Controller, Get, Post, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { Role } from '../../common/enums/role.enum';
import { AdminAccountsService } from './admin-accounts.service';
import { CreateAdminDto } from './dto/create-admin.dto';

/**
 * Creating admin accounts is one of the most sensitive actions in the
 * system, so it is restricted to SUPER_ADMIN only (never ADMIN) and
 * always audited.
 */
@Roles(Role.SUPER_ADMIN)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/admins')
export class AdminAccountsController {
  constructor(private readonly service: AdminAccountsService) {}

  @Get()
  async list() {
    return this.service.listAdmins();
  }

  @Post()
  @AuditLog({ action: 'ADMIN_ACCOUNT_CREATED', targetType: 'User' })
  async create(@Body() dto: CreateAdminDto) {
    return this.service.createAdmin(dto.phone, dto.role);
  }
}
