import { IsDateString, IsString, MinLength } from 'class-validator';

export class SubmitDriverProfileDto {
  @IsString()
  @MinLength(3)
  fullName!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsString()
  @MinLength(3)
  licenceNumber!: string;

  @IsDateString()
  licenceExpiryDate!: string;
}
