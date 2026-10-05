import { IsString, MinLength, MaxLength } from 'class-validator';

export class RejectDocumentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
