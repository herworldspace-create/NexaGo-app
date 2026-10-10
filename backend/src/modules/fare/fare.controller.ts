import { Body, Controller, Get, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FareService } from './fare.service';
import { EstimateFareDto } from './dto/estimate-fare.dto';

@Controller('fares')
export class FareController {
  constructor(private readonly fareService: FareService) {}

  @Roles(Role.PASSENGER)
  @Get('areas')
  async listAreas() {
    return this.fareService.listActiveOperatingAreas();
  }

  @Roles(Role.PASSENGER)
  @Get('categories')
  async listCategories() {
    return this.fareService.listActivePassengerCategories();
  }

  @Roles(Role.PASSENGER)
  @Post('estimate')
  async estimate(@Body() dto: EstimateFareDto) {
    return this.fareService.estimate(dto);
  }
}
