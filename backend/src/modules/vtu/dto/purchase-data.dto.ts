import { IsEnum, IsPhoneNumber, IsString, Length, Matches, MinLength } from 'class-validator';
import { NetworkProvider } from '../../../common/enums/user-wallet.enum';

export class PurchaseDataDto {
  @IsEnum(NetworkProvider)
  network!: NetworkProvider;

  @IsPhoneNumber('NG')
  phoneNumber!: string;

  @IsString()
  @MinLength(1)
  bundleCode!: string;

  @IsString()
  @Length(4, 6)
  @Matches(/^\d+$/, { message: 'PIN must contain only digits.' })
  pin!: string;
}
