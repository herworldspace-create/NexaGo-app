import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { UnregisterDeviceTokenDto } from './dto/unregister-device-token.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('device-tokens')
  async registerDeviceToken(@Body() dto: RegisterDeviceTokenDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.registerDeviceToken(user.userId, dto.token, dto.platform);
  }

  @Delete('device-tokens')
  async unregisterDeviceToken(@Body() dto: UnregisterDeviceTokenDto, @CurrentUser() user: AuthenticatedUser) {
    await this.notificationsService.unregisterDeviceToken(user.userId, dto.token);
    return { unregistered: true };
  }

  @Get()
  async list(@Query('unread') unread: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.list(user.userId, unread === 'true');
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.notificationsService.getUnreadCount(user.userId) };
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markRead(user.userId, id);
  }
}
