import { IsIn, IsPhoneNumber, IsString, Length } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

export class VerifyOtpDto {
  @IsPhoneNumber('NG', { message: 'A valid Nigerian phone number is required.' })
  phone!: string;

  @IsString()
  @Length(4, 8)
  code!: string;

  /**
   * Role the account should be created with if this is a first-time
   * registration. Ignored if the user already exists. Admins can never be
   * created via this public endpoint.
   */
  @IsIn([Role.PASSENGER, Role.DRIVER])
  intendedRole!: Role.PASSENGER | Role.DRIVER;
}
