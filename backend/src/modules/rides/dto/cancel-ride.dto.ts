import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelRideDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
