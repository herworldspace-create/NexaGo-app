import { IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateRideDto {
  @IsUUID()
  operatingAreaId!: string;

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
  destinationLat!: number;

  @IsLongitude()
  destinationLng!: number;

  @IsOptional()
  @IsString()
  destinationAddress?: string;

  /**
   * Distance/duration are supplied by the caller (from a maps/routing
   * provider integrated in a later phase) — the ride and fare engines are
   * deliberately decoupled from routing, consistent with FareService.
   */
  @IsNumber()
  @Min(0)
  estimatedDistanceKm!: number;

  @IsNumber()
  @Min(0)
  estimatedDurationMinutes!: number;
}
