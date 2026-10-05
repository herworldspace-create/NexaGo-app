import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelDeliveryDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
