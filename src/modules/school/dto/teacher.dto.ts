import { TeacherStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateTeacherDto {
  @IsUUID() employeeId!: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializationAreas?: string[];
  @IsOptional() @IsString() teachingMethodology?: string;
  @IsOptional() @IsInt() @Min(0) yearsExperienceSpecialNeeds?: number;
}

export class UpdateTeacherDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializationAreas?: string[];
  @IsOptional() @IsString() teachingMethodology?: string;
  @IsOptional() @IsInt() @Min(0) yearsExperienceSpecialNeeds?: number;
  @IsOptional() @IsEnum(TeacherStatus) status?: TeacherStatus;
}

export class SetTeacherShiftsDto {
  @IsArray()
  @ArrayMaxSize(2)
  @IsUUID('4', { each: true })
  shiftIds!: string[];
}

export class CreateCertificationDto {
  @IsString() title!: string;
  @IsString() issuingBody!: string;
  @IsOptional() @IsDateString() issuedDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
}
