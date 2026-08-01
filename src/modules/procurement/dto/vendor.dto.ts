import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
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
import { VendorDocumentType, VendorType, Prisma } from '@prisma/client';

export class CreateVendorDto {
  @IsString() @MinLength(1) name!: string;
  @IsEnum(VendorType) vendorType!: VendorType;
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxRegistrationNumber?: string;
  @IsOptional() bankDetails?: Prisma.InputJsonValue;
  @IsOptional() @IsInt() @Min(0) paymentTermsDays?: number;
  @IsOptional() @IsString() coaPayableAccountCode?: string;
}

export class UpdateVendorDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(VendorType) vendorType?: VendorType;
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxRegistrationNumber?: string;
  @IsOptional() bankDetails?: Prisma.InputJsonValue;
  @IsOptional() @IsInt() @Min(0) paymentTermsDays?: number;
  @IsOptional() @IsBoolean() isPreferred?: boolean;
  @IsOptional() @IsString() coaPayableAccountCode?: string;
}

export class BlacklistVendorDto {
  @IsString() @MinLength(1) reason!: string;
}

export class AddVendorDocumentDto {
  @IsEnum(VendorDocumentType) documentType!: VendorDocumentType;
  @IsUUID() attachmentId!: string;
  @IsOptional() @IsDateString() issuedDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class AddVendorRatingDto {
  @IsUUID() poId!: string;
  @IsNumber() deliveryTimelinessScore!: number;
  @IsNumber() qualityScore!: number;
  @IsNumber() pricingScore!: number;
  @IsNumber() responsivenessScore!: number;
  @IsOptional() @IsString() comments?: string;
}
