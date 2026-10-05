import { IsBoolean, IsLatitude, IsLongitude, IsNumber, IsOptional } from 'class-validator';

export class UpdateDriverLocationDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsBoolean()
  isOnline!: boolean;
}
