import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PrLineDto {
  @IsOptional() @IsUUID() itemId?: string;
  @IsString() itemDescription!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsUUID() unitOfMeasureId?: string;
  @IsNumber() @Min(0) estimatedUnitCost!: number;
  @IsOptional() @IsString() remarks?: string;
}

export class CreatePurchaseRequestDto {
  @IsOptional() @IsDateString() requiredByDate?: string;
  @IsOptional() @IsString() justification?: string;
  @IsOptional() @IsUUID() budgetLineId?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrLineDto)
  lines!: PrLineDto[];
}

export class UpdatePurchaseRequestDto {
  @IsOptional() @IsDateString() requiredByDate?: string;
  @IsOptional() @IsString() justification?: string;
  @IsOptional() @IsUUID() budgetLineId?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrLineDto)
  lines?: PrLineDto[];
}

export class DeptReviewDto {
  @IsOptional() approved?: boolean;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsString() reason?: string;
}

export class ApprovePurchaseRequestDto {
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsString() budgetOverrideReason?: string;
}

export class RejectPurchaseRequestDto {
  @IsString() @MinLength(1) reason!: string;
}
