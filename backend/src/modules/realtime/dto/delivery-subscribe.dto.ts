import { IsUUID } from 'class-validator';

export class DeliverySubscribeDto {
  @IsUUID()
  deliveryId!: string;
}
