import { IsEnum, IsOptional, IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';
import { PackageCategory, WeightTier } from '../../../common/enums/delivery-status.enum';

export class PackageDetailsDto {
  @IsEnum(PackageCategory)
  category!: PackageCategory;

  @IsEnum(WeightTier)
  weightTier!: WeightTier;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  recipientName!: string;

  @IsPhoneNumber('NG', { message: 'A valid Nigerian phone number is required for the recipient.' })
  recipientPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryNotes?: string;
}
