import {
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBehavioralIncidentDto {
  @IsDateString() incidentDatetime!: string;
  @IsString() @MinLength(1) behaviorType!: string;
  @IsOptional() @IsString() antecedent?: string;
  @IsString() @MinLength(1) description!: string;
  @IsOptional() @IsString() consequence?: string;
  @IsOptional() @IsObject() personsInvolved?: Record<string, unknown>;
  @IsOptional() @IsString() interventionApplied?: string;
  @IsOptional() @IsInt() @Min(0) durationMinutes?: number;
  @IsOptional() @IsUUID() linkedIepGoalId?: string;
}

export class CreateBehaviorSupportPlanDto {
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() reviewDate?: string;
  @IsObject() targetBehaviors!: Record<string, unknown> | unknown[];
  @IsObject() strategies!: Record<string, unknown> | unknown[];
}

export class UpdateBehaviorSupportPlanDto {
  @IsOptional() @IsDateString() reviewDate?: string;
  @IsOptional() @IsObject() targetBehaviors?: Record<string, unknown> | unknown[];
  @IsOptional() @IsObject() strategies?: Record<string, unknown> | unknown[];
  @IsOptional() @IsString() status?: 'active' | 'archived';
}
