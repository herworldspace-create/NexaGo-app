import { IsString, Length } from 'class-validator';

export class ConfirmDeliveryDto {
  @IsString()
  @Length(4, 4, { message: 'Confirmation PIN must be exactly 4 digits.' })
  pin!: string;
}
