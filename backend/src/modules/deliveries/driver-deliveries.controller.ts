import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DeliveriesService } from './deliveries.service';
import { CancelDeliveryDto } from './dto/cancel-delivery.dto';
import { ConfirmDeliveryDto } from './dto/confirm-delivery.dto';

@Roles(Role.DRIVER)
@Controller('drivers/deliveries')
export class DriverDeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get('available')
  async available(@CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.listAvailableForDriver(user.userId);
  }

  @Get('current')
  async current(@CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.getCurrentForDriver(user.userId);
  }

  @Post(':id/accept')
  async accept(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.acceptDelivery(id, user.userId);
  }

  @Post(':id/picked-up')
  async pickedUp(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.markPickedUp(id, user.userId);
  }

  @Post(':id/start-transit')
  async startTransit(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.startTransit(id, user.userId);
  }

  /** Requires the recipient's 4-digit confirmation PIN — see DeliveriesService.completeDelivery. */
  @Post(':id/complete')
  async complete(@Param('id') id: string, @Body() dto: ConfirmDeliveryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.completeDelivery(id, user.userId, dto.pin);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body() dto: CancelDeliveryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.cancelByDriver(id, user.userId, dto.reason);
  }
}
