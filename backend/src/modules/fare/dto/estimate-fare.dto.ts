import { IsNumber, IsUUID, Min } from 'class-validator';

export class EstimateFareDto {
  @IsUUID()
  operatingAreaId!: string;

  @IsUUID()
  vehicleCategoryId!: string;

  /**
   * Distance and duration are provided by the caller (derived from a maps/
   * routing provider integrated in a later phase) rather than computed
   * here — the fare engine is deliberately decoupled from routing.
   */
  @IsNumber()
  @Min(0)
  distanceKm!: number;

  @IsNumber()
  @Min(0)
  durationMinutes!: number;
}
