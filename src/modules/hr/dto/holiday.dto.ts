import { Type } from 'class-transformer';
import { HolidayType } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateHolidayDto {
  @IsString() @MinLength(1) name!: string;
  @IsDateString() holidayDate!: string;
  @IsEnum(HolidayType) type!: HolidayType;
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  appliesToDepartments?: string[];
  @IsOptional() @IsString() description?: string;
}

export class UpdateHolidayDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsDateString() holidayDate?: string;
  @IsOptional() @IsEnum(HolidayType) type?: HolidayType;
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  appliesToDepartments?: string[];
  @IsOptional() @IsString() description?: string;
}

export class BulkImportHolidayDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateHolidayDto)
  holidays!: CreateHolidayDto[];
}
