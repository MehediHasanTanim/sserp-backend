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

export class GrnLineDto {
  @IsUUID() poLineId!: string;
  @IsNumber() @Min(0.001) receivedQuantity!: number;
  @IsNumber() @Min(0) unitCost!: number;
  @IsOptional() @IsString() batchNumber?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) serialNumbers?: string[];
}

export class CreateGrnDto {
  @IsUUID() poId!: string;
  @IsDateString() receiptDate!: string;
  @IsOptional() @IsString() deliveryNoteReference?: string;
  @IsUUID() receivedAtLocationId!: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrnLineDto)
  lines!: GrnLineDto[];
}

export class UpdateGrnDto {
  @IsOptional() @IsString() deliveryNoteReference?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrnLineDto)
  lines?: GrnLineDto[];
}

export class QualityCheckLineDto {
  @IsUUID() grnLineId!: string;
  @IsNumber() @Min(0) acceptedQuantity!: number;
  @IsNumber() @Min(0) rejectedQuantity!: number;
  @IsOptional() @IsString() rejectionReason?: string;
}

export class QualityCheckGrnDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QualityCheckLineDto)
  lines!: QualityCheckLineDto[];
}
