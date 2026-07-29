import { ProgressReportType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateReportTemplateDto {
  @IsString() @MinLength(1) name!: string;
  @IsEnum(ProgressReportType) reportType!: ProgressReportType;
  @IsOptional() @IsString() disabilityCategory?: string;
  @IsObject() sections!: Record<string, unknown> | unknown[];
  @IsOptional() @IsObject() ratingScale?: Record<string, unknown>;
}

export class UpdateReportTemplateDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsObject() sections?: Record<string, unknown> | unknown[];
  @IsOptional() @IsObject() ratingScale?: Record<string, unknown>;
  @IsOptional() isActive?: boolean;
}

export class ProgressReportGoalLinkDto {
  @IsUUID() iepGoalId!: string;
  @IsOptional() @IsString() progressNote?: string;
  @IsOptional() @IsString() rating?: string;
}

export class CreateProgressReportDto {
  @IsEnum(ProgressReportType) reportType!: ProgressReportType;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsUUID() academicYearId!: string;
  @IsOptional() @IsObject() narrativeSections?: Record<string, unknown>;
  @IsOptional() @IsObject() domainRatings?: Record<string, unknown>;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => ProgressReportGoalLinkDto)
  goalLinks?: ProgressReportGoalLinkDto[];
}

export class UpdateProgressReportDto {
  @IsOptional() @IsObject() narrativeSections?: Record<string, unknown>;
  @IsOptional() @IsObject() domainRatings?: Record<string, unknown>;
}

export class RejectProgressReportDto {
  @IsString() @MinLength(1) comment!: string;
}

export class AddProgressReportEvidenceDto {
  @IsUUID() attachmentId!: string;
  @IsOptional() @IsString() caption?: string;
}
