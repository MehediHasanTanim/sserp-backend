import {
  EmployeeStatus,
  EmploymentType,
  ExitType,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString() @MinLength(2) fullName!: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() personalEmail?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
  @IsOptional() @IsUUID() photoAttachmentId?: string;
  @IsUUID() departmentId!: string;
  @IsUUID() designationId!: string;
  @IsEnum(EmploymentType) employmentType!: EmploymentType;
  @IsOptional() @IsUUID() reportingManagerId?: string;
  @IsDateString() joiningDate!: string;
  @IsOptional() @IsDateString() probationEndDate?: string;
  @IsInt() @Min(0) basicSalary!: number;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @MinLength(2) fullName?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() personalEmail?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
  @IsOptional() @IsUUID() photoAttachmentId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() designationId?: string;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional() @IsUUID() reportingManagerId?: string;
  @IsOptional() @IsDateString() probationEndDate?: string;
  @IsOptional() @IsInt() @Min(0) basicSalary?: number;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
}

export class TransferEmployeeDto {
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() designationId?: string;
  @IsOptional() @IsUUID() reportingManagerId?: string;
  @IsDateString() effectiveDate!: string;
  @IsString() @MinLength(1) reason!: string;
}

export class ConfirmProbationDto {
  @IsOptional() @IsDateString() confirmationDate?: string;
}

export class ExitEmployeeDto {
  @IsEnum(ExitType) exitType!: ExitType;
  @IsDateString() noticeDate!: string;
  @IsDateString() lastWorkingDay!: string;
  @IsOptional() @IsString() exitInterviewNotes?: string;
  @IsOptional() @IsObject() clearanceChecklist?: Record<string, unknown>;
}
