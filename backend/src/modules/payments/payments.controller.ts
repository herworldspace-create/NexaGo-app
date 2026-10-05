import { Body, Controller, Get, HttpCode, HttpStatus, Headers, Param, Post, Req, RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { FundWalletDto } from '../user-wallet/dto/fund-wallet.dto';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // --- General wallet funding --------------------------------------------------

  /**
   * Lives here (not in UserWalletController) so UserWalletModule never
   * needs to depend on PaymentsModule — PaymentsModule already depends
   * on UserWalletModule (to credit funding on webhook success), and a
   * dependency the other way would be circular.
   */
  @Post('wallet/fund')
  async fundWallet(@Body() dto: FundWalletDto, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.initiateWalletFunding(user.userId, dto.amountKobo, dto.email);
  }

  // --- Rides -----------------------------------------------------------------

  @Roles(Role.PASSENGER)
  @Post('rides/:id/payment')
  async initiateForRide(@Param('id') rideId: string, @Body() dto: InitiatePaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.initiatePayment('ride', rideId, user.userId, dto);
  }

  @Get('rides/:id/payment')
  async getForRide(@Param('id') rideId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.getPayment('ride', rideId, user.userId, user.role);
  }

  @Roles(Role.DRIVER)
  @Post('drivers/rides/:id/payment/confirm-cash')
  async confirmCashForRide(@Param('id') rideId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.confirmCashPayment('ride', rideId, user.userId);
  }

  // --- Deliveries --------------------------------------------------------------

  @Post('deliveries/:id/payment')
  async initiateForDelivery(
    @Param('id') deliveryId: string,
    @Body() dto: InitiatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.initiatePayment('delivery', deliveryId, user.userId, dto);
  }

  @Get('deliveries/:id/payment')
  async getForDelivery(@Param('id') deliveryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.getPayment('delivery', deliveryId, user.userId, user.role);
  }

  @Roles(Role.DRIVER)
  @Post('drivers/deliveries/:id/payment/confirm-cash')
  async confirmCashForDelivery(@Param('id') deliveryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.confirmCashPayment('delivery', deliveryId, user.userId);
  }

  // --- Gateway webhook -----------------------------------------------------------

  /**
   * Public because Paystack (not an authenticated user) calls this.
   * Security comes entirely from signature verification inside
   * PaymentsService.handleWebhook — never from anything in this
   * controller. Requires `rawBody: true` in main.ts's NestFactory.create
   * so `req.rawBody` is the exact byte sequence Paystack signed.
   * Handles both ride and delivery payments — PaymentsService resolves
   * which one a given webhook's payment reference belongs to.
   */
  @Public()
  @Post('payments/webhook/paystack')
  @HttpCode(HttpStatus.OK)
  async paystackWebhook(@Req() req: RawBodyRequest<Request>, @Headers('x-paystack-signature') signature?: string) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    await this.paymentsService.handleWebhook(rawBody, signature);
    return { received: true };
  }
}
