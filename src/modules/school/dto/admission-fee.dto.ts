import { PaymentMethod } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class PayAdmissionFeeDto {
  @IsInt() @Min(1) amount!: number;
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional() @IsString() paymentReference?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
}

export class WaiveAdmissionFeeDto {
  @IsString() @MinLength(1) reason!: string;
}

export class CreateAdmissionFeeSettingDto {
  @IsUUID() academicYearId!: string;
  @IsOptional() @IsString() studentCategory?: string;
  @IsInt() @Min(0) amount!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateAdmissionFeeSettingDto {
  @IsOptional() @IsInt() @Min(0) amount?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
