import { DiscountType, FeeFrequency, FeeHeadType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFeeCategoryDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateFeeCategoryDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateFeeHeadDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsEnum(FeeHeadType) headType!: FeeHeadType;
  @IsOptional() @IsBoolean() isRecurring?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateFeeHeadDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() isRecurring?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateFeeStructureDto {
  @IsUUID() academicYearId!: string;
  @IsUUID() feeCategoryId!: string;
  @IsUUID() feeHeadId!: string;
  @IsInt() @Min(0) amount!: number;
  @IsEnum(FeeFrequency) frequency!: FeeFrequency;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateFeeStructureDto {
  @IsOptional() @IsInt() @Min(0) amount?: number;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class SetStudentFeeCategoryDto {
  @IsUUID() feeCategoryId!: string;
  @IsDateString() effectiveFrom!: string;
}

export class CreateDiscountDto {
  @IsEnum(DiscountType) discountType!: DiscountType;
  @IsInt() @Min(0) value!: number;
  @IsOptional() @IsUUID() feeHeadId?: string;
  @IsOptional() @IsString() reason?: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class CreateScholarshipDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() sponsor?: string;
  @IsEnum(DiscountType) coverageType!: DiscountType;
  @IsInt() @Min(0) value!: number;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() notes?: string;
}
