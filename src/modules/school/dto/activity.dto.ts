import { ActivityAttendanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateActivityTypeDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsInt() @Min(0) defaultFeeAmount?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateActivityTypeDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsInt() @Min(0) defaultFeeAmount?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateActivityDto {
  @IsUUID() activityTypeId!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsDateString() activityDate!: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsInt() @Min(1) durationMinutes?: number;
  @IsOptional() @IsString() venue?: string;
  @IsInt() @Min(1) capacity!: number;
  @IsOptional() @IsInt() @Min(0) feeAmount?: number;
  @IsDateString() optInDeadline!: string;
  @IsOptional() @IsBoolean() waitlistEnabled?: boolean;
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  supervisorTeacherIds?: string[];
}

export class UpdateActivityDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() activityDate?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsInt() @Min(1) durationMinutes?: number;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsInt() @Min(0) feeAmount?: number;
  @IsOptional() @IsDateString() optInDeadline?: string;
  @IsOptional() @IsBoolean() waitlistEnabled?: boolean;
}

export class CancelActivityDto {
  @IsString() @MinLength(1) reason!: string;
}

export class InviteActivityDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  studentIds!: string[];
}

export class ManualEnrollmentDecisionDto {
  @IsUUID() studentId!: string;
  @IsEnum(['confirm', 'decline']) decision!: 'confirm' | 'decline';
  @IsOptional() @IsString() reason?: string;
}

export class WithdrawEnrollmentDto {
  @IsOptional() @IsString() reason?: string;
}

class ActivityAttendanceItemDto {
  @IsUUID() studentId!: string;
  @IsEnum(ActivityAttendanceStatus) status!: ActivityAttendanceStatus;
  @IsOptional() @IsString() remarks?: string;
}

export class MarkActivityAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ActivityAttendanceItemDto)
  items!: ActivityAttendanceItemDto[];
}

export class AddActivityMediaDto {
  @IsUUID() attachmentId!: string;
  @IsOptional() @IsString() caption?: string;
}

export class PostActivitySummaryDto {
  @IsString() @MinLength(1) postSummary!: string;
}
