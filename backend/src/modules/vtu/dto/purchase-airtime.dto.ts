import { IsEnum, IsInt, IsPhoneNumber, IsString, Length, Matches, Min } from 'class-validator';
import { NetworkProvider } from '../../../common/enums/user-wallet.enum';

export class PurchaseAirtimeDto {
  @IsEnum(NetworkProvider)
  network!: NetworkProvider;

  @IsPhoneNumber('NG')
  phoneNumber!: string;

  @IsInt()
  @Min(5_000) // ₦50 minimum, a common aggregator floor
  amountKobo!: number;

  @IsString()
  @Length(4, 6)
  @Matches(/^\d+$/, { message: 'PIN must contain only digits.' })
  pin!: string;
}
