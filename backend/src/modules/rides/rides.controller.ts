import { Body, Controller, Get, Param, Post, Patch } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { RidesService } from './rides.service';
import { CreateRideDto } from './dto/create-ride.dto';
import { CancelRideDto } from './dto/cancel-ride.dto';
import { UpdateRideDestinationDto } from './dto/update-ride-destination.dto';

@Controller('rides')
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Roles(Role.PASSENGER)
  @Post()
  async create(@Body() dto: CreateRideDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.createRide(user.userId, dto);
  }

  // Registered before ':id' so 'current' is never swallowed by the :id route.
  @Roles(Role.PASSENGER)
  @Get('current')
  async current(@CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.getCurrentForPassenger(user.userId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.getRide(id, user.userId, user.role);
  }

  /**
   * The only endpoint that can change a ride's locked-in fare — an
   * explicit destination/route update by the passenger. See
   * RidesService.updateDestination for the fixed-price rationale.
   */
  @Roles(Role.PASSENGER)
  @Patch(':id/destination')
  async updateDestination(
    @Param('id') id: string,
    @Body() dto: UpdateRideDestinationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ridesService.updateDestination(id, user.userId, dto);
  }

  @Get(':id/fare-revisions')
  async fareRevisions(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.getFareRevisions(id, user.userId, user.role);
  }

  @Roles(Role.PASSENGER)
  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body() dto: CancelRideDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.cancelByPassenger(id, user.userId, dto.reason);
  }
}
