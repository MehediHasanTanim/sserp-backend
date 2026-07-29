import { IepGoalStatus, IepReviewType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateIepPlanDto {
  @IsUUID() academicYearId!: string;
  @IsOptional() @IsUUID() createdByTeacherId?: string;
  @IsOptional() @IsInt() @Min(1) reviewFrequencyMonths?: number;
  @IsOptional() @IsDateString() startDate?: string;
}

export class UpdateIepPlanDto {
  @IsOptional() @IsInt() @Min(1) reviewFrequencyMonths?: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsUUID() createdByTeacherId?: string;
}

export class CreateIepGoalDto {
  @IsUUID() skillDomainId!: string;
  @IsOptional() @IsUUID() learningObjectiveId?: string;
  @IsOptional() @IsString() goalType?: string;
  @IsString() @MinLength(1) description!: string;
  @IsOptional() @IsString() baselineDescription?: string;
  @IsOptional() @IsString() measurementCriteria?: string;
  @IsOptional() @IsDateString() targetDate?: string;
  @IsOptional() @IsUUID() responsibleTeacherId?: string;
  @IsOptional() @IsInt() @Min(0) sequence?: number;
}

export class UpdateIepGoalDto {
  @IsOptional() @IsUUID() skillDomainId?: string;
  @IsOptional() @IsUUID() learningObjectiveId?: string;
  @IsOptional() @IsString() goalType?: string;
  @IsOptional() @IsString() @MinLength(1) description?: string;
  @IsOptional() @IsString() baselineDescription?: string;
  @IsOptional() @IsString() measurementCriteria?: string;
  @IsOptional() @IsDateString() targetDate?: string;
  @IsOptional() @IsUUID() responsibleTeacherId?: string;
  @IsOptional() @IsInt() @Min(0) sequence?: number;
}

export class RecordGoalProgressDto {
  @IsEnum(IepGoalStatus) toStatus!: IepGoalStatus;
  @IsInt() @Min(0) @Max(100) progressPercentage!: number;
  @IsOptional() @IsString() narrative?: string;
}

export class CreateIepReviewDto {
  @IsDateString() scheduledDate!: string;
  @IsEnum(IepReviewType) reviewType!: IepReviewType;
}

export class CompleteIepReviewDto {
  @IsString() @MinLength(1) outcomeSummary!: string;
  @IsOptional() @IsDateString() nextReviewDate?: string;
  @IsOptional() @IsObject() attendees?: Record<string, unknown>;
}

export class AcknowledgeIepDto {
  @IsString() @MinLength(1) signatureText!: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() userAgent?: string;
}