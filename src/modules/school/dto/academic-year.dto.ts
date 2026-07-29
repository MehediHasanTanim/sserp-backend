import { AcademicYearStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAcademicYearDto {
  @IsString() @MinLength(2) name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsEnum(AcademicYearStatus) status?: AcademicYearStatus;
}

export class UpdateAcademicYearDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsEnum(AcademicYearStatus) status?: AcademicYearStatus;
}

export class CreateAcademicTermDto {
  @IsString() @MinLength(1) name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsInt() @Min(1) sequence!: number;
}
