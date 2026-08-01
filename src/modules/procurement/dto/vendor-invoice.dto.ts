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

export class VendorInvoiceLineDto {
  @IsOptional() @IsUUID() poLineId?: string;
  @IsOptional() @IsUUID() grnLineId?: string;
  @IsString() description!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsUUID() taxId?: string;
}

export class CreateVendorInvoiceDto {
  @IsUUID() vendorId!: string;
  @IsOptional() @IsString() vendorInvoiceReference?: string;
  @IsOptional() @IsUUID() poId?: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) grnIds?: string[];
  @IsDateString() invoiceDate!: string;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsUUID() attachmentId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorInvoiceLineDto)
  lines!: VendorInvoiceLineDto[];
}

export class ApproveVendorInvoiceDto {
  @IsOptional() @IsString() principalOverrideReason?: string;
}

export class RejectVendorInvoiceDto {
  @IsString() @MinLength(1) reason!: string;
}
