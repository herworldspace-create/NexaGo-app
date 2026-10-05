import { IsString, MinLength, MaxLength } from 'class-validator';

export class ResolveComplaintDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  resolutionNote!: string;
}
