import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSkillDomainDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @Min(0) sequence!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateSkillDomainDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) sequence?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCurriculumDto {
  @IsUUID() academicYearId!: string;
  @IsString() @MinLength(1) disabilityCategory!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateCurriculumDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateLearningObjectiveDto {
  @IsUUID() skillDomainId!: string;
  @IsString() @MinLength(1) description!: string;
  @IsInt() @Min(0) sequence!: number;
}

export class UpdateLearningObjectiveDto {
  @IsOptional() @IsUUID() skillDomainId?: string;
  @IsOptional() @IsString() @MinLength(1) description?: string;
  @IsOptional() @IsInt() @Min(0) sequence?: number;
}
