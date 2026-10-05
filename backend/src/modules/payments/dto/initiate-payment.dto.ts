import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment.enum';

export class InitiatePaymentDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  /**
   * Required for CARD/BANK_TRANSFER (Paystack needs a customer email).
   * Not required for CASH. Users authenticate by phone/OTP only, so we
   * don't assume an email exists on the account.
   */
  @IsOptional()
  @IsEmail()
  email?: string;
}
