import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { VehicleCategoryType } from '../../../common/enums/vehicle-category.enum';

export class CreateVehicleCategoryDto {
  @IsString()
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'code must be lowercase letters, numbers, hyphens, or underscores only.',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** PASSENGER (rides) or DELIVERY (Nexa Deliver). Defaults to PASSENGER if omitted. */
  @IsOptional()
  @IsEnum(VehicleCategoryType)
  type?: VehicleCategoryType;
}

export class UpdateVehicleCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
