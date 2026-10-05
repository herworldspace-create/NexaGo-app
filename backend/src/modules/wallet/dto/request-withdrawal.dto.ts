import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RequestWithdrawalDto {
  @IsInt()
  @Min(100) // smallest sensible withdrawal, ₦1 — prevents dust/spam requests
  amountKobo!: number;

  @IsOptional()
  @IsString()
  payoutAccountReference?: string;
}
