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

export class PoLineFromPrDto {
  @IsUUID() prLineId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsUUID() taxId?: string;
}

export class CreatePurchaseOrderDto {
  @IsUUID() vendorId!: string;
  @IsDateString() poDate!: string;
  @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoLineFromPrDto)
  lines!: PoLineFromPrDto[];
}

export class UpdatePurchaseOrderDto {
  @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() paymentTerms?: string;
}

export class AmendPurchaseOrderDto {
  @IsString() @MinLength(1) reason!: string;
  @IsOptional() @IsNumber() @Min(0) totalAmount?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoLineFromPrDto)
  lines?: PoLineFromPrDto[];
}

export class CancelPurchaseOrderDto {
  @IsString() @MinLength(1) reason!: string;
}
