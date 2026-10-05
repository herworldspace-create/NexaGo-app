import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { RidesModule } from '../rides/rides.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { AdminDriversController } from './admin-drivers.controller';
import { AdminDriversService } from './admin-drivers.service';
import { AdminPassengersController } from './admin-passengers.controller';
import { AdminPassengersService } from './admin-passengers.service';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminAuditLogsService } from './admin-audit-logs.service';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminFareController } from './admin-fare.controller';
import { AdminFareService } from './admin-fare.service';
import { AdminRidesController } from './admin-rides.controller';
import { AdminRidesService } from './admin-rides.service';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminPaymentsService } from './admin-payments.service';
import { AdminWithdrawalsController } from './admin-withdrawals.controller';
import { AdminComplaintsController } from './admin-complaints.controller';
import { AdminComplaintsService } from './admin-complaints.service';

@Module({
  imports: [DocumentsModule, RidesModule, WalletModule], // for shared StorageProvider, RidesService, WalletService
  controllers: [
    AdminDriversController,
    AdminPassengersController,
    AdminAuditLogsController,
    AdminAccountsController,
    AdminFareController,
    AdminRidesController,
    AdminPaymentsController,
    AdminWithdrawalsController,
    AdminComplaintsController,
  ],
  providers: [
    AdminDriversService,
    AdminPassengersService,
    AdminAuditLogsService,
    AdminAccountsService,
    AdminFareService,
    AdminRidesService,
    AdminPaymentsService,
    AdminComplaintsService,
    AuditLogInterceptor,
  ],
})
export class AdminModule {}
