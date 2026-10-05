import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { WalletService } from '../wallet/wallet.service';
import { AdminDriversService } from './admin-drivers.service';
import { ListDriversQueryDto } from './dto/list-drivers-query.dto';
import { RejectDocumentDto } from './dto/reject-document.dto';
import { RejectDriverDto } from './dto/reject-driver.dto';

/**
 * Every mutating route here is restricted to ADMIN/SUPER_ADMIN and audited.
 * RBAC is enforced server-side via the global RolesGuard — this controller
 * never trusts a client-supplied role or permission flag.
 */
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/drivers')
export class AdminDriversController {
  constructor(
    private readonly service: AdminDriversService,
    private readonly walletService: WalletService,
  ) {}

  @Get()
  async list(@Query() query: ListDriversQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @AuditLog({ action: 'DRIVER_PROFILE_VIEWED', targetType: 'DriverProfile' })
  async getDetail(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.service.getDetail(id, admin.role);
  }

  @Get(':id/wallet')
  @AuditLog({ action: 'DRIVER_WALLET_VIEWED', targetType: 'DriverWallet' })
  async getWallet(@Param('id') id: string) {
    return this.walletService.getWalletForDriverProfile(id);
  }

  @Get('documents/:documentId/url')
  @AuditLog({ action: 'DRIVER_DOCUMENT_ACCESSED', targetType: 'DriverDocument' })
  async getDocumentUrl(@Param('documentId') documentId: string) {
    return this.service.getDocumentSignedUrl(documentId);
  }

  @Post('documents/:documentId/approve')
  @AuditLog({ action: 'DRIVER_DOCUMENT_APPROVED', targetType: 'DriverDocument' })
  async approveDocument(@Param('documentId') documentId: string) {
    return this.service.approveDocument(documentId);
  }

  @Post('documents/:documentId/reject')
  @AuditLog({ action: 'DRIVER_DOCUMENT_REJECTED', targetType: 'DriverDocument' })
  async rejectDocument(@Param('documentId') documentId: string, @Body() dto: RejectDocumentDto) {
    return this.service.rejectDocument(documentId, dto.reason);
  }

  @Post(':id/request-resubmission')
  @AuditLog({ action: 'DRIVER_DOCUMENTS_RESUBMISSION_REQUESTED', targetType: 'DriverProfile' })
  async requestResubmission(@Param('id') id: string) {
    return this.service.markDocumentsPending(id);
  }

  @Post(':id/submit-for-review')
  @AuditLog({ action: 'DRIVER_SUBMITTED_FOR_ADMIN_REVIEW', targetType: 'DriverProfile' })
  async submitForReview(@Param('id') id: string) {
    return this.service.submitForAdminReview(id);
  }

  @Post(':id/approve')
  @AuditLog({ action: 'DRIVER_APPROVED', targetType: 'DriverProfile' })
  async approve(@Param('id') id: string) {
    return this.service.approveDriver(id);
  }

  @Post(':id/activate')
  @AuditLog({ action: 'DRIVER_ACTIVATED', targetType: 'DriverProfile' })
  async activate(@Param('id') id: string) {
    return this.service.activateDriver(id);
  }

  @Post(':id/reject')
  @AuditLog({ action: 'DRIVER_REJECTED', targetType: 'DriverProfile' })
  async reject(@Param('id') id: string, @Body() dto: RejectDriverDto) {
    return this.service.rejectDriver(id, dto.reason);
  }

  @Post(':id/suspend')
  @AuditLog({ action: 'DRIVER_SUSPENDED', targetType: 'DriverProfile' })
  async suspend(@Param('id') id: string) {
    return this.service.suspendDriver(id);
  }

  @Post(':id/reactivate')
  @AuditLog({ action: 'DRIVER_REACTIVATED', targetType: 'DriverProfile' })
  async reactivate(@Param('id') id: string) {
    return this.service.reactivateDriver(id);
  }
}
