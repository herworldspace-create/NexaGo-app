import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FareService } from './fare.service';
import { EstimateFareDto } from './dto/estimate-fare.dto';

@Controller('fares')
export class FareController {
  constructor(private readonly fareService: FareService) {}

  @Roles(Role.PASSENGER)
  @Post('estimate')
  async estimate(@Body() dto: EstimateFareDto) {
    return this.fareService.estimate(dto);
  }
}
