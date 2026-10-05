import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DriverVerificationService } from './driver-verification.service';
import { DriverLocationService } from './driver-location.service';
import { DriverVehiclesService } from './driver-vehicles.service';
import { SubmitDriverProfileDto } from './dto/submit-driver-profile.dto';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

@Controller('drivers/verification')
export class DriverVerificationController {
  constructor(private readonly service: DriverVerificationService) {}

  @Roles(Role.DRIVER)
  @Post('profile')
  async submitProfile(@Body() dto: SubmitDriverProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.submitProfile({ userId: user.userId, ...dto });
  }

  @Roles(Role.DRIVER)
  @Get('status')
  async status(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getStatus(user.userId);
  }
}

@Controller('drivers/location')
export class DriverLocationController {
  constructor(
    private readonly locationService: DriverLocationService,
    private readonly verificationService: DriverVerificationService,
  ) {}

  /**
   * A driver may only report themselves online if currently eligible to
   * accept rides. Reporting a location while offline is always allowed
   * (e.g. to clear stale state); going online is gated.
   */
  @Roles(Role.DRIVER)
  @Post()
  async update(@Body() dto: UpdateDriverLocationDto, @CurrentUser() user: AuthenticatedUser) {
    if (dto.isOnline) {
      await this.verificationService.assertCanAcceptRides(user.userId);
    }
    return this.locationService.update({ userId: user.userId, ...dto });
  }
}

@Controller('drivers/vehicles')
export class DriverVehiclesController {
  constructor(private readonly vehiclesService: DriverVehiclesService) {}

  @Roles(Role.DRIVER)
  @Post()
  async create(@Body() dto: CreateVehicleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.create(user.userId, dto);
  }

  @Roles(Role.DRIVER)
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.list(user.userId);
  }
}
