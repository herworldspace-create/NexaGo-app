import { IsUUID } from 'class-validator';

export class RideSubscribeDto {
  @IsUUID()
  rideId!: string;
}
