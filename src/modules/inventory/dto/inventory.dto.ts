import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsBoolean() isAssetCategory?: boolean;
  @IsOptional() @IsString() defaultCoaExpenseCode?: string;
  @IsOptional() @IsString() defaultCoaAssetCode?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() isAssetCategory?: boolean;
  @IsOptional() @IsString() defaultCoaExpenseCode?: string;
  @IsOptional() @IsString() defaultCoaAssetCode?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateUnitDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsBoolean() allowsFraction?: boolean;
}

export class CreateLocationDto {
  @IsString() @MinLength(1) name!: string;
  @IsEnum(['store', 'department', 'room'] as const) locationType!:
    'store' | 'department' | 'room';
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsUUID() parentId?: string;
}

export class UpdateLocationDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateItemDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsUUID() categoryId!: string;
  @IsUUID() unitOfMeasureId!: string;
  @IsEnum(['consumable', 'asset', 'spare'] as const) itemNature!:
    'consumable' | 'asset' | 'spare';
  @IsOptional()
  @IsEnum(['fifo', 'weighted_average'] as const)
  valuationMethod?: 'fifo' | 'weighted_average';
  @IsOptional() @IsNumber() @Min(0) minimumStockLevel?: number;
  @IsOptional() @IsNumber() @Min(0) reorderQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) maximumStockLevel?: number;
  @IsOptional() @IsBoolean() tracksExpiry?: boolean;
  @IsOptional() @IsBoolean() tracksSerial?: boolean;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() @Min(0) standardCost?: number;
}

export class UpdateItemDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) minimumStockLevel?: number;
  @IsOptional() @IsNumber() @Min(0) reorderQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) maximumStockLevel?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) standardCost?: number;
}

export class TransferStockDto {
  @IsUUID() itemId!: string;
  @IsUUID() fromLocationId!: string;
  @IsUUID() toLocationId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsString() remarks?: string;
}

export class IssueRequestLineDto {
  @IsUUID() itemId!: string;
  @IsNumber() @Min(0.001) requestedQuantity!: number;
}

export class CreateIssueRequestDto {
  @IsUUID() toLocationId!: string;
  @IsOptional() @IsString() purpose?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IssueRequestLineDto)
  lines!: IssueRequestLineDto[];
}

export class IssueFromLocationDto {
  @IsUUID() fromLocationId!: string;
}

export class AdjustmentLineDto {
  @IsUUID() itemId!: string;
  @IsNumber() systemQuantity!: number;
  @IsNumber() adjustedQuantity!: number;
  @IsInt() @Min(0) unitCost!: number;
  @IsOptional() @IsString() remarks?: string;
}

export class CreateAdjustmentDto {
  @IsUUID() locationId!: string;
  @IsString() adjustmentDate!: string;
  @IsString() @MinLength(1) reason!: string;
  @IsEnum(['increase', 'decrease'] as const) adjustmentType!:
    'increase' | 'decrease';
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustmentLineDto)
  lines!: AdjustmentLineDto[];
}

export class CreateAssetDto {
  @IsUUID() itemId!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsString() purchaseDate!: string;
  @IsInt() @Min(0) purchaseCost!: number;
  @IsOptional() @IsUUID() supplierVendorId?: string;
  @IsOptional() @IsString() warrantyExpiryDate?: string;
  @IsOptional() @IsInt() @Min(1) usefulLifeMonths?: number;
  @IsOptional() @IsInt() @Min(0) salvageValue?: number;
  @IsEnum(['straight_line', 'reducing_balance'] as const) depreciationMethod!:
    'straight_line' | 'reducing_balance';
  @IsOptional() @IsNumber() depreciationRatePercent?: number;
  @IsOptional() @IsUUID() currentLocationId?: string;
}

export class UpdateAssetDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsInt() @Min(1) usefulLifeMonths?: number;
  @IsOptional() @IsUUID() currentLocationId?: string;
}

export class AssignAssetDto {
  @IsEnum(['employee', 'department', 'room'] as const) assignedToType!:
    'employee' | 'department' | 'room';
  @IsUUID() assignedToId!: string;
  @IsString() assignedFrom!: string;
  @IsOptional() @IsString() assignedToDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ReturnAssetDto {
  @IsEnum(['new', 'good', 'fair', 'damaged', 'scrapped'] as const)
  returnCondition!: 'new' | 'good' | 'fair' | 'damaged' | 'scrapped';
  @IsOptional() @IsString() notes?: string;
}

export class AssetConditionDto {
  @IsEnum(['new', 'good', 'fair', 'damaged', 'scrapped'] as const) condition!:
    'new' | 'good' | 'fair' | 'damaged' | 'scrapped';
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
}

export class DisposeAssetDto {
  @IsString() disposalDate!: string;
  @IsEnum(['sale', 'scrap', 'donation', 'write_off', 'lost'] as const)
  disposalType!: 'sale' | 'scrap' | 'donation' | 'write_off' | 'lost';
  @IsOptional() @IsInt() @Min(0) proceedsAmount?: number;
  @IsString() @MinLength(1) reason!: string;
  @IsOptional() @IsUUID() attachmentId?: string;
}

export class RunDepreciationDto {
  @IsOptional() @IsInt() year?: number;
  @IsOptional() @IsInt() @Min(1) month?: number;
}

export class CreateAuditDto {
  @IsEnum(['half_yearly', 'ad_hoc', 'cycle_count'] as const) auditType!:
    'half_yearly' | 'ad_hoc' | 'cycle_count';
  @IsString() @MinLength(1) periodLabel!: string;
  @IsString() scheduledDate!: string;
  @IsArray() @IsUUID(undefined, { each: true }) locationIds!: string[];
  @IsArray() @IsUUID(undefined, { each: true }) categoryIds!: string[];
  @IsOptional() @IsString() notes?: string;
}

export class PatchAuditLineDto {
  @IsUUID() lineId!: string;
  @IsNumber() @Min(0) physicalQuantity!: number;
  @IsOptional() @IsString() explanation?: string;
}

export class PatchAuditLinesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatchAuditLineDto)
  lines!: PatchAuditLineDto[];
}

export class CreateCorrectiveActionDto {
  @IsUUID() auditLineId!: string;
  @IsString() @MinLength(1) actionDescription!: string;
  @IsUUID() responsibleUserId!: string;
  @IsString() dueDate!: string;
}

export class UpdateCorrectiveActionDto {
  @IsOptional()
  @IsEnum(['open', 'in_progress', 'completed', 'waived'] as const)
  status?: 'open' | 'in_progress' | 'completed' | 'waived';
  @IsOptional() @IsString() outcomeNotes?: string;
}
