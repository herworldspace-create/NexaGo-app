import { IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PackageDetailsDto } from './package-details.dto';

export class CreateDeliveryDto {
  @IsUUID()
  operatingAreaId!: string;

  /** Must reference a VehicleCategory with type = DELIVERY (e.g. delivery bike, delivery van). */
  @IsUUID()
  vehicleCategoryId!: string;

  @IsLatitude()
  pickupLat!: number;

  @IsLongitude()
  pickupLng!: number;

  @IsOptional()
  @IsString()
  pickupAddress?: string;

  @IsLatitude()
  dropoffLat!: number;

  @IsLongitude()
  dropoffLng!: number;

  @IsOptional()
  @IsString()
  dropoffAddress?: string;

  /** From the same routing source as ride creation (see RouteModule) — decoupled from routing here too. */
  @IsNumber()
  @Min(0)
  estimatedDistanceKm!: number;

  @IsNumber()
  @Min(0)
  estimatedDurationMinutes!: number;

  @ValidateNested()
  @Type(() => PackageDetailsDto)
  package!: PackageDetailsDto;
}
