import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateFareConfigurationDto {
  @IsUUID()
  operatingAreaId!: string;

  @IsUUID()
  vehicleCategoryId!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsInt()
  @Min(0)
  baseFareKobo!: number;

  @IsInt()
  @Min(0)
  perKmRateKobo!: number;

  @IsInt()
  @Min(0)
  perMinuteRateKobo!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  serviceFeeFlatKobo?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  serviceFeePercentBasisPoints?: number;

  @IsInt()
  @Min(0)
  minimumFareKobo!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellationFeeKobo?: number;

  /** Basis points (10000 = 100%) of the fare the platform keeps; the rest goes to the driver's wallet. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  platformCommissionBasisPoints?: number;
}
