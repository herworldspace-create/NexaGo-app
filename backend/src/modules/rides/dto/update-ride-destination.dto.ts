import { IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateRideDestinationDto {
  @IsLatitude()
  destinationLat!: number;

  @IsLongitude()
  destinationLng!: number;

  @IsOptional()
  @IsString()
  destinationAddress?: string;

  /**
   * Updated distance/duration for the NEW destination, from the same
   * routing source as the original request (see RouteModule). Required
   * so the fare can be recalculated with real numbers rather than
   * guessed — this endpoint intentionally does not estimate distance
   * itself.
   */
  @IsNumber()
  @Min(0)
  estimatedDistanceKm!: number;

  @IsNumber()
  @Min(0)
  estimatedDurationMinutes!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
