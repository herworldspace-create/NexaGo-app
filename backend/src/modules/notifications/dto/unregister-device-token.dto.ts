import { IsString, MinLength } from 'class-validator';

export class UnregisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;
}
