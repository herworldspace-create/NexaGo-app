import { IsInt, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

const CURRENT_YEAR = new Date().getFullYear();

export class CreateVehicleDto {
  @IsUUID()
  vehicleCategoryId!: string;

  @IsString()
  @MinLength(2)
  make!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsInt()
  @Min(1990)
  @Max(CURRENT_YEAR + 1)
  year!: number;

  @IsString()
  @MinLength(2)
  colour!: string;

  @IsString()
  @MinLength(3)
  plateNumber!: string;
}
