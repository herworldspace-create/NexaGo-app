import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateOperatingAreaDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  state!: string;
}

export class UpdateOperatingAreaDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  state?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
