import { IsPhoneNumber } from 'class-validator';

export class RequestOtpDto {
  @IsPhoneNumber('NG', { message: 'A valid Nigerian phone number is required.' })
  phone!: string;
}
