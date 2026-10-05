import { IsDateString, IsString, Length, IsBoolean, Equals } from 'class-validator';

export class InitiateIdentityVerificationDto {
  @IsString()
  @Length(11, 11, { message: 'NIN must be exactly 11 digits.' })
  nin!: string;

  @IsString()
  fullName!: string;

  @IsDateString()
  dateOfBirth!: string;

  /**
   * Must be explicitly true. We do not proceed with a NIN check without
   * affirmative, recorded consent.
   */
  @IsBoolean()
  @Equals(true, { message: 'Consent is required to perform identity verification.' })
  consentGiven!: boolean;
}
