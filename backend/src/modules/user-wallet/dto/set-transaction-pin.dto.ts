import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class SetTransactionPinDto {
  @IsString()
  @Length(4, 6)
  @Matches(/^\d+$/, { message: 'PIN must contain only digits.' })
  newPin!: string;

  /** Required when changing an existing PIN; omit only when setting one for the first time. */
  @IsOptional()
  @IsString()
  currentPin?: string;
}
