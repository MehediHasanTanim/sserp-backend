import { IncidentSeverity, MedicalIncidentType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertMedicalRecordDto {
  @IsOptional() @IsObject() conditions?: Record<string, unknown> | unknown[];
  @IsOptional() @IsObject() allergies?: Record<string, unknown> | unknown[];
  @IsOptional() @IsObject() medications?: Record<string, unknown> | unknown[];
  @IsOptional() @IsString() emergencyProtocol?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsString() physicianName?: string;
  @IsOptional() @IsString() physicianPhone?: string;
  @IsOptional() @IsBoolean() hasAlertFlag?: boolean;
  @IsOptional() @IsString() @MaxLength(300) alertSummary?: string;
}

export class CreateImmunizationDto {
  @IsString() @MinLength(1) vaccineName!: string;
  @IsInt() @Min(1) doseNumber!: number;
  @IsDateString() administeredDate!: string;
  @IsOptional() @IsDateString() nextDueDate?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
}

export class CreateMedicalIncidentDto {
  @IsDateString() incidentDatetime!: string;
  @IsEnum(MedicalIncidentType) incidentType!: MedicalIncidentType;
  @IsString() @MinLength(1) description!: string;
  @IsOptional() @IsString() actionTaken?: string;
  @IsEnum(IncidentSeverity) severity!: IncidentSeverity;
  @IsOptional() @IsArray() attachmentIds?: string[];
}
