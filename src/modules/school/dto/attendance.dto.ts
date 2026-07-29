import { StudentAttendanceStatus } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StudentAttendanceItemDto {
  @IsUUID() studentId!: string;
  @IsEnum(StudentAttendanceStatus) status!: StudentAttendanceStatus;
  @IsOptional() @IsString() remarks?: string;
}

export class BulkStudentAttendanceDto {
  @IsDateString() attendanceDate!: string;
  @IsUUID() shiftId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StudentAttendanceItemDto)
  items!: StudentAttendanceItemDto[];
}

export class UpdateStudentAttendanceDto {
  @IsEnum(StudentAttendanceStatus) status!: StudentAttendanceStatus;
  @IsOptional() @IsString() remarks?: string;
}

export class CreateAttendanceAmendmentDto {
  @IsEnum(StudentAttendanceStatus) requestedStatus!: StudentAttendanceStatus;
  @IsString() @MinLength(1) reason!: string;
}

export class DecideAttendanceAmendmentDto {
  @IsBoolean() approve!: boolean;
}

export class UpdateAttendanceSettingsDto {
  @IsOptional() freezeAfterDays?: number;
  @IsOptional() @IsBoolean() allowTeacherMarking?: boolean;
  @IsOptional() @IsBoolean() unauthorizedAbsenceAlertEnabled?: boolean;
}
