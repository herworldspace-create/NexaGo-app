import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { RatingsService } from './ratings.service';
import { SubmitRatingDto } from './dto/submit-rating.dto';

@Controller('rides')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post(':id/rating')
  async submit(@Param('id') rideId: string, @Body() dto: SubmitRatingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ratingsService.submitRating(rideId, user.userId, dto);
  }

  @Get(':id/rating')
  async get(@Param('id') rideId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ratingsService.getForRide(rideId, user.userId);
  }
}
