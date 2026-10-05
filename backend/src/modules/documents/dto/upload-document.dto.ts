import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { DriverDocumentType } from '../../../common/enums/verification-status.enum';

export class UploadDocumentDto {
  @IsEnum(DriverDocumentType)
  type!: DriverDocumentType;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
