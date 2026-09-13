import { PaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class GenerateMonthlyInvoicesDto {
  /** Preferred by the UI: `YYYY-MM`. When set, month/year are derived from it. */
  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsInt()
  @Min(2000)
  year?: number;
}

export class CancelInvoiceDto {
  @IsString() @MinLength(1) reason!: string;
}

export class WaiveInvoiceDto {
  @IsInt() @Min(1) amount!: number;
  @IsString() @MinLength(1) reason!: string;
}

export class RecordPaymentDto {
  @IsInt() @Min(1) amount!: number;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsDateString() paymentDate?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
}

export class ReversePaymentDto {
  @IsString() @MinLength(1) reason!: string;
}
