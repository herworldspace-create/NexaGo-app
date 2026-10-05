import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { RidesService } from './rides.service';
import { CancelRideDto } from './dto/cancel-ride.dto';

@Roles(Role.DRIVER)
@Controller('drivers/rides')
export class DriverRidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Get('available')
  async available(@CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.listAvailableForDriver(user.userId);
  }

  @Get('current')
  async current(@CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.getCurrentForDriver(user.userId);
  }

  @Post(':id/accept')
  async accept(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.acceptRide(id, user.userId);
  }

  @Post(':id/arrived')
  async arrived(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.markArrived(id, user.userId);
  }

  @Post(':id/start')
  async start(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.startRide(id, user.userId);
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.completeRide(id, user.userId);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body() dto: CancelRideDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.cancelByDriver(id, user.userId, dto.reason);
  }
}
