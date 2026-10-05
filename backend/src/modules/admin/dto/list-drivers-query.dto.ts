import { IsEnum, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { DriverVerificationStatus } from '../../../common/enums/verification-status.enum';

export class ListDriversQueryDto {
  @IsOptional()
  @IsEnum(DriverVerificationStatus)
  status?: DriverVerificationStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
