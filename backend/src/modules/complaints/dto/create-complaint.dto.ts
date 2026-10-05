import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ComplaintCategory } from '../../../common/enums/complaint.enum';

export class CreateComplaintDto {
  @IsOptional()
  @IsUUID()
  rideId?: string;

  @IsEnum(ComplaintCategory)
  category!: ComplaintCategory;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;
}
