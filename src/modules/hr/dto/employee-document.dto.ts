import { EmployeeDocumentType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateEmployeeDocumentDto {
  @IsEnum(EmployeeDocumentType) documentType!: EmployeeDocumentType;
  @IsUUID() attachmentId!: string;
  @IsOptional() @IsDateString() issuedDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateEmployeeDocumentDto {
  @IsOptional()
  @IsEnum(EmployeeDocumentType)
  documentType?: EmployeeDocumentType;
  @IsOptional() @IsUUID() attachmentId?: string;
  @IsOptional() @IsDateString() issuedDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateEmployeeContractDto {
  @IsString() contractType!: string;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
}

export class UpdateEmployeeContractDto {
  @IsOptional() @IsString() contractType?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
}
