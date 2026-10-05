import { IsLatitude, IsLongitude, IsNumber, IsOptional } from 'class-validator';

export class DriverLocationPingDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsNumber()
  heading?: number;
}
