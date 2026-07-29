import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateShiftDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @IsInt() @Min(0) capacityLimit?: number;
  @IsOptional() @IsString() breakStart?: string;
  @IsOptional() @IsString() breakEnd?: string;
  @IsOptional() workingHours?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateShiftDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsInt() @Min(0) capacityLimit?: number;
  @IsOptional() @IsString() breakStart?: string;
  @IsOptional() @IsString() breakEnd?: string;
  @IsOptional() workingHours?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
