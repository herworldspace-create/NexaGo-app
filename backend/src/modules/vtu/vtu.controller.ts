import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { NetworkProvider } from '../../common/enums/user-wallet.enum';
import { VtuService } from './vtu.service';
import { PurchaseAirtimeDto } from './dto/purchase-airtime.dto';
import { PurchaseDataDto } from './dto/purchase-data.dto';

@Controller('vtu')
export class VtuController {
  constructor(private readonly vtuService: VtuService) {}

  @Get('data-bundles/:network')
  async listDataBundles(@Param('network') network: NetworkProvider) {
    return this.vtuService.listDataBundles(network);
  }

  @Post('airtime')
  async purchaseAirtime(@Body() dto: PurchaseAirtimeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.vtuService.purchaseAirtime(user.userId, dto);
  }

  @Post('data')
  async purchaseData(@Body() dto: PurchaseDataDto, @CurrentUser() user: AuthenticatedUser) {
    return this.vtuService.purchaseData(user.userId, dto);
  }

  @Get('orders')
  async listOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.vtuService.listMyOrders(user.userId);
  }
}
