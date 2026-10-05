import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class SetSurgeDto {
  @IsUUID()
  operatingAreaId!: string;

  @IsOptional()
  @IsUUID()
  vehicleCategoryId?: string;

  /** 10000 = 1.00x. Must be >= 10000 — surge never discounts. */
  @IsInt()
  @Min(10_000)
  multiplierBasisPoints!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
