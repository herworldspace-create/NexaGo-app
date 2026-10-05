import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AdminComplaintsService } from './admin-complaints.service';
import { ListComplaintsQueryDto } from './dto/list-complaints-query.dto';
import { ResolveComplaintDto } from './dto/resolve-complaint.dto';

@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/complaints')
export class AdminComplaintsController {
  constructor(private readonly service: AdminComplaintsService) {}

  @Get()
  async list(@Query() query: ListComplaintsQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @AuditLog({ action: 'COMPLAINT_VIEWED', targetType: 'Complaint' })
  async getDetail(@Param('id') id: string) {
    return this.service.getDetail(id);
  }

  @Post(':id/in-review')
  @AuditLog({ action: 'COMPLAINT_MARKED_IN_REVIEW', targetType: 'Complaint' })
  async markInReview(@Param('id') id: string) {
    return this.service.markInReview(id);
  }

  @Post(':id/resolve')
  @AuditLog({ action: 'COMPLAINT_RESOLVED', targetType: 'Complaint' })
  async resolve(@Param('id') id: string, @Body() dto: ResolveComplaintDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.service.resolve(id, admin.userId, dto.resolutionNote);
  }

  @Post(':id/dismiss')
  @AuditLog({ action: 'COMPLAINT_DISMISSED', targetType: 'Complaint' })
  async dismiss(@Param('id') id: string, @Body() dto: ResolveComplaintDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.service.dismiss(id, admin.userId, dto.resolutionNote);
  }
}
