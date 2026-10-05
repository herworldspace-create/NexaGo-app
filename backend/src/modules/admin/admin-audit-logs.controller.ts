import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AdminAuditLogsService } from './admin-audit-logs.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

/**
 * Audit log visibility is restricted to SUPER_ADMIN — audit trails are
 * themselves sensitive (they reveal which admin acted on which user) and
 * are not exposed to regular ADMIN accounts.
 */
@Roles(Role.SUPER_ADMIN)
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly service: AdminAuditLogsService) {}

  @Get()
  async list(@Query() query: ListAuditLogsQueryDto) {
    return this.service.list(query);
  }
}
