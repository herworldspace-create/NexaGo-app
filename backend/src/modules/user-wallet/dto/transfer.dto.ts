import { IsInt, IsOptional, IsPhoneNumber, IsString, Length, Matches, Min, MaxLength } from 'class-validator';

export class TransferDto {
  @IsPhoneNumber('NG', { message: 'A valid Nigerian phone number is required for the recipient.' })
  recipientPhone!: string;

  @IsInt()
  @Min(100)
  amountKobo!: number;

  @IsString()
  @Length(4, 6)
  @Matches(/^\d+$/, { message: 'PIN must contain only digits.' })
  pin!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
