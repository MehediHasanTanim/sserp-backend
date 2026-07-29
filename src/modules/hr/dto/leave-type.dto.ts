import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateLeaveTypeDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsNumber() @Min(0) annualEntitlementDays!: number;
  @IsOptional() @IsBoolean() carryForwardAllowed?: boolean;
  @IsOptional() @IsNumber() @Min(0) maxCarryForwardDays?: number;
  @IsOptional() @IsInt() @Min(0) requiresMedicalCertificateAfterDays?: number;
  @IsOptional() @IsBoolean() isEncashable?: boolean;
  @IsOptional() @IsNumber() @Min(0) maxEncashableDaysPerYear?: number;
  @IsOptional() @IsNumber() @Min(0) minBalanceToRetain?: number;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  appliesToEmploymentTypes?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLeaveTypeDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsNumber() @Min(0) annualEntitlementDays?: number;
  @IsOptional() @IsBoolean() carryForwardAllowed?: boolean;
  @IsOptional() @IsNumber() @Min(0) maxCarryForwardDays?: number;
  @IsOptional() @IsInt() @Min(0) requiresMedicalCertificateAfterDays?: number;
  @IsOptional() @IsBoolean() isEncashable?: boolean;
  @IsOptional() @IsNumber() @Min(0) maxEncashableDaysPerYear?: number;
  @IsOptional() @IsNumber() @Min(0) minBalanceToRetain?: number;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  appliesToEmploymentTypes?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
