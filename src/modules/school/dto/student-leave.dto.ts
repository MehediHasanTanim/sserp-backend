import { StudentLeaveType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStudentLeaveRequestDto {
  @IsEnum(StudentLeaveType) leaveType!: StudentLeaveType;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() documentUrl?: string;
}

export class RejectStudentLeaveDto {
  @IsString() @MinLength(1) reviewNote!: string;
}

export class ApproveStudentLeaveDto {
  @IsOptional() @IsString() reviewNote?: string;
}
