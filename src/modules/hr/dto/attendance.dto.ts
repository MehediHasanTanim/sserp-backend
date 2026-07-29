import { Type } from 'class-transformer';
import { HrAttendanceStatus } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class BulkAttendanceItemDto {
  @IsUUID() employeeId!: string;
  @IsDateString() attendanceDate!: string;
  @IsEnum(HrAttendanceStatus) status!: HrAttendanceStatus;
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class BulkAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceItemDto)
  items!: BulkAttendanceItemDto[];
}

export class UpdateAttendanceDto {
  @IsOptional() @IsEnum(HrAttendanceStatus) status?: HrAttendanceStatus;
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
  @IsOptional() @IsInt() @Min(0) overtimeMinutes?: number;
  @IsOptional() @IsString() remarks?: string;
}
