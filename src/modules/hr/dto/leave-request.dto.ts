import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateLeaveRequestDto {
  /** Only honoured for callers with `hr:create`; otherwise the caller's own employee record is used. */
  @IsOptional() @IsUUID() employeeId?: string;
  @IsUUID() leaveTypeId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsBoolean() isHalfDay?: boolean;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsUUID() medicalCertificateAttachmentId?: string;
}

export class ApproveLeaveRequestDto {
  @IsOptional() @IsString() comment?: string;
}

export class RejectLeaveRequestDto {
  @IsString() @MinLength(1) reason!: string;
}
