import { IsEnum, IsString, MinLength } from 'class-validator';
import { DevicePlatform } from '../../../common/enums/notification.enum';

export class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}
