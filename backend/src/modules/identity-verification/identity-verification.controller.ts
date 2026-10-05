import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { IdentityVerificationAppService } from './identity-verification.service';
import { InitiateIdentityVerificationDto } from './dto/initiate-identity-verification.dto';

@Controller('identity-verification')
export class IdentityVerificationController {
  constructor(private readonly service: IdentityVerificationAppService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async initiate(
    @Body() dto: InitiateIdentityVerificationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    return this.service.initiate({
      userId: user.userId,
      nin: dto.nin,
      fullName: dto.fullName,
      dateOfBirth: dto.dateOfBirth,
      ipAddress: ip,
    });
  }

  @Get('status')
  async status(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getStatus(user.userId);
  }
}
