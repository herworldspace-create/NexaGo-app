import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';

@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Post()
  async create(@Body() dto: CreateComplaintDto, @CurrentUser() user: AuthenticatedUser) {
    return this.complaintsService.create(user.userId, dto);
  }

  @Get('mine')
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.complaintsService.listMine(user.userId);
  }

  @Get(':id')
  async getMine(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.complaintsService.getMine(user.userId, id);
  }
}
