import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { RouteService } from './route.service';
import { PreviewRouteDto } from './dto/preview-route.dto';

@Controller('routes')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  /**
   * Called by the frontend before creating a ride/delivery to get an
   * accurate distance/duration (from real road routing, not a client
   * guess) to feed into the fixed-price fare quote.
   */
  @Post('preview')
  async preview(@Body() dto: PreviewRouteDto) {
    return this.routeService.preview(
      { latitude: dto.originLat, longitude: dto.originLng },
      { latitude: dto.destinationLat, longitude: dto.destinationLng },
    );
  }
}

@Controller('rides')
export class RideRouteController {
  constructor(private readonly routeService: RouteService) {}

  @Get(':id/route')
  async getRoute(@Param('id') rideId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.routeService.getRouteForRide(rideId, user.userId, user.role);
  }
}
