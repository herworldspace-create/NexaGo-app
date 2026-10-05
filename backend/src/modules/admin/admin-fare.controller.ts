import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AdminFareService } from './admin-fare.service';
import { CreateOperatingAreaDto, UpdateOperatingAreaDto } from './dto/operating-area.dto';
import { CreateVehicleCategoryDto, UpdateVehicleCategoryDto } from './dto/vehicle-category.dto';
import { CreateFareConfigurationDto } from './dto/create-fare-configuration.dto';
import { SetSurgeDto } from './dto/set-surge.dto';

@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/fare')
export class AdminFareController {
  constructor(private readonly service: AdminFareService) {}

  // Operating areas
  @Get('areas')
  async listAreas() {
    return this.service.listOperatingAreas();
  }

  @Post('areas')
  @AuditLog({ action: 'OPERATING_AREA_CREATED', targetType: 'OperatingArea' })
  async createArea(@Body() dto: CreateOperatingAreaDto) {
    return this.service.createOperatingArea(dto);
  }

  @Patch('areas/:id')
  @AuditLog({ action: 'OPERATING_AREA_UPDATED', targetType: 'OperatingArea' })
  async updateArea(@Param('id') id: string, @Body() dto: UpdateOperatingAreaDto) {
    return this.service.updateOperatingArea(id, dto);
  }

  // Vehicle categories
  @Get('categories')
  async listCategories() {
    return this.service.listVehicleCategories();
  }

  @Post('categories')
  @AuditLog({ action: 'VEHICLE_CATEGORY_CREATED', targetType: 'VehicleCategory' })
  async createCategory(@Body() dto: CreateVehicleCategoryDto) {
    return this.service.createVehicleCategory(dto);
  }

  @Patch('categories/:id')
  @AuditLog({ action: 'VEHICLE_CATEGORY_UPDATED', targetType: 'VehicleCategory' })
  async updateCategory(@Param('id') id: string, @Body() dto: UpdateVehicleCategoryDto) {
    return this.service.updateVehicleCategory(id, dto);
  }

  // Fare configurations
  @Get('configurations')
  async listConfigurations(
    @Query('operatingAreaId') operatingAreaId?: string,
    @Query('vehicleCategoryId') vehicleCategoryId?: string,
  ) {
    return this.service.listFareConfigurations(operatingAreaId, vehicleCategoryId);
  }

  @Post('configurations')
  @AuditLog({ action: 'FARE_CONFIGURATION_CREATED', targetType: 'FareConfiguration' })
  async createConfiguration(@Body() dto: CreateFareConfigurationDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.service.createFareConfiguration(dto, admin.userId);
  }

  @Post('configurations/:id/deactivate')
  @AuditLog({ action: 'FARE_CONFIGURATION_DEACTIVATED', targetType: 'FareConfiguration' })
  async deactivateConfiguration(@Param('id') id: string) {
    return this.service.deactivateFareConfiguration(id);
  }

  // Surge
  @Get('surge')
  async listSurge(@Query('operatingAreaId') operatingAreaId?: string) {
    return this.service.listSurgeSettings(operatingAreaId);
  }

  @Post('surge')
  @AuditLog({ action: 'SURGE_SET', targetType: 'SurgeSetting' })
  async setSurge(@Body() dto: SetSurgeDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.service.setSurge(dto, admin.userId);
  }

  @Post('surge/clear')
  @AuditLog({ action: 'SURGE_CLEARED', targetType: 'SurgeSetting' })
  async clearSurge(
    @Body('operatingAreaId') operatingAreaId: string,
    @Body('vehicleCategoryId') vehicleCategoryId?: string,
  ) {
    return this.service.clearSurge(operatingAreaId, vehicleCategoryId);
  }
}
