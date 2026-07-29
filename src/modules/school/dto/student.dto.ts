import { StudentStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EnrollGuardianDto {
  @IsString() @MinLength(1) fullName!: string;
  @IsString() @MinLength(1) relation!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() occupation?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() isPrimary?: boolean;
  @IsOptional() isEmergencyContact?: boolean;
  @IsOptional() emergencyPriority?: number;
  @IsOptional() portalAccessEnabled?: boolean;
}

export class CreateStudentDto {
  @IsString() @MinLength(2) fullName!: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() religion?: string;
  @IsOptional() @IsString() disabilityCategory?: string;
  @IsOptional() @IsString() severityLevel?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsUUID() photoAttachmentId?: string;
  @IsOptional() @IsString() previousInstitution?: string;
  @IsOptional() @IsString() previousTherapyHistory?: string;
  @IsOptional() @IsString() supportNeeds?: string;
  @IsUUID() shiftId!: string;
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional() @IsDateString() admissionDate?: string;
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EnrollGuardianDto)
  guardians?: EnrollGuardianDto[];
}

export class UpdateStudentDto {
  @IsOptional() @IsString() @MinLength(2) fullName?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() religion?: string;
  @IsOptional() @IsString() disabilityCategory?: string;
  @IsOptional() @IsString() severityLevel?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsUUID() photoAttachmentId?: string;
  @IsOptional() @IsString() previousInstitution?: string;
  @IsOptional() @IsString() previousTherapyHistory?: string;
  @IsOptional() @IsString() supportNeeds?: string;
  @IsOptional() @IsUUID() shiftId?: string;
}

export class ChangeStudentStatusDto {
  @IsEnum(StudentStatus) status!: StudentStatus;
  @IsString() @MinLength(1) reason!: string;
}

export class ReEnrollStudentDto {
  @IsUUID() academicYearId!: string;
  @IsUUID() shiftId!: string;
  @IsDateString() enrollmentDate!: string;
}

export class CreateGuardianDto {
  @IsString() @MinLength(1) fullName!: string;
  @IsString() @MinLength(1) relation!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() occupation?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() isPrimary?: boolean;
  @IsOptional() isEmergencyContact?: boolean;
  @IsOptional() emergencyPriority?: number;
  @IsOptional() portalAccessEnabled?: boolean;
}

export class UpdateGuardianDto {
  @IsOptional() @IsString() @MinLength(1) fullName?: string;
  @IsOptional() @IsString() @MinLength(1) relation?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() occupation?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() isPrimary?: boolean;
  @IsOptional() isEmergencyContact?: boolean;
  @IsOptional() emergencyPriority?: number;
  @IsOptional() portalAccessEnabled?: boolean;
}

export class CreateStudentDocumentDto {
  @IsString() documentType!:
    | 'birth_certificate'
    | 'disability_certificate'
    | 'doctor_report'
    | 'previous_iep'
    | 'photo'
    | 'other';
  @IsUUID() attachmentId!: string;
  @IsOptional() @IsDateString() issuedDate?: string;
  @IsOptional() @IsString() notes?: string;
}
