import { IsIn, IsPhoneNumber } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

export class CreateAdminDto {
  @IsPhoneNumber('NG', { message: 'A valid Nigerian phone number is required.' })
  phone!: string;

  @IsIn([Role.ADMIN, Role.SUPER_ADMIN])
  role!: Role.ADMIN | Role.SUPER_ADMIN;
}
