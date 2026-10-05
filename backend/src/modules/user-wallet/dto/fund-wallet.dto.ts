import { IsEmail, IsInt, Min } from 'class-validator';

export class FundWalletDto {
  @IsInt()
  @Min(100) // ₦1 minimum, mirrors the withdrawal-request floor elsewhere
  amountKobo!: number;

  /** Paystack requires a customer email for card charges. */
  @IsEmail()
  email!: string;
}
