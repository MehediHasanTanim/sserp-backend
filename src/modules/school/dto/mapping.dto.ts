import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateMappingDto {
  @IsUUID() studentId!: string;
  @IsUUID() teacherEmployeeId!: string;
  @IsUUID() shiftId!: string;
  @IsOptional() @IsString() reason?: string;
}

export class EndMappingDto {
  @IsString() @MinLength(1) reason!: string;
}
