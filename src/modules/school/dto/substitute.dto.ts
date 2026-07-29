import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class AssignSubstituteDto {
  @IsUUID() substituteAssignmentId!: string;
  @IsUUID() substituteTeacherId!: string;
}

export class CreateSubstituteAssignmentDto {
  @IsUUID() studentId!: string;
  @IsUUID() primaryTeacherId!: string;
  @IsUUID() substituteTeacherId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateSubstituteAssignmentDto {
  @IsOptional() @IsUUID() substituteTeacherId?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CancelSubstituteAssignmentDto {
  @IsString() @MinLength(1) reason!: string;
}
