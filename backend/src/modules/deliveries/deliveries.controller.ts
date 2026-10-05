import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { CancelDeliveryDto } from './dto/cancel-delivery.dto';

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  async create(@Body() dto: CreateDeliveryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.createDelivery(user.userId, dto);
  }

  // Registered before ':id' so 'current' is never swallowed by the :id route.
  @Get('current')
  async current(@CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.getCurrentForSender(user.userId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.getDelivery(id, user.userId, user.role);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body() dto: CancelDeliveryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.cancelBySender(id, user.userId, dto.reason);
  }
}
