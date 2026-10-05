import { Body, Controller, HttpCode, HttpStatus, Ip, Post, Headers, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthenticatedUser } from './types/authenticated-user.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestOtp(@Body() dto: RequestOtpDto, @Ip() ip: string): Promise<void> {
    await this.authService.requestOtp(dto.phone, ip);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/verify')
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-device-id') deviceId: string,
  ) {
    const result = await this.authService.verifyOtpAndAuthenticate(dto.phone, dto.code, dto.intendedRole, {
      ipAddress: ip,
      userAgent,
      deviceId,
    });

    return {
      userId: result.userId,
      role: result.role,
      isNewAccount: result.isNewAccount,
      ...result.tokens,
    };
  }

  @Public()
  @Post('token/refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    try {
      return await this.authService.refresh(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(user.sessionId);
  }
}
