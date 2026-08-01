import {
  IsArray,
  IsDateString,
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
import { PaymentMethod } from '@prisma/client';

export class PaymentAllocationDto {
  @IsUUID() vendorInvoiceId!: string;
  @IsInt() @Min(1) allocatedAmount!: number;
}

export class CreateVendorPaymentDto {
  @IsUUID() vendorId!: string;
  @IsInt() @Min(1) amount!: number;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsDateString() scheduledDate!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsUUID() bankAccountId?: string;
  @IsOptional() @IsString() blacklistOverrideReason?: string;
}

export class PayVendorPaymentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
  @IsOptional() @IsString() blacklistOverrideReason?: string;
}

export class CreateVendorAdvanceDto {
  @IsUUID() vendorId!: string;
  @IsOptional() @IsUUID() poId?: string;
  @IsInt() @Min(1) amount!: number;
  @IsDateString() advanceDate!: string;
}

export class AdjustVendorAdvanceDto {
  @IsUUID() invoiceId!: string;
  @IsInt() @Min(1) amount!: number;
}
