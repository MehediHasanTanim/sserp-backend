import { Type } from 'class-transformer';
import { HrAttendanceStatus } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

export function IsIsoOrTime(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isIsoOrTime',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true;
          if (typeof value !== 'string') return false;
          const trimmed = value.trim();
          if (/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(trimmed)) return true;
          const parsed = Date.parse(trimmed);
          return !isNaN(parsed);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid ISO 8601 date string or HH:mm time`;
        },
      },
    });
  };
}

export class BulkAttendanceItemDto {
  @IsUUID() employeeId!: string;
  @IsDateString() attendanceDate!: string;
  @IsEnum(HrAttendanceStatus) status!: HrAttendanceStatus;
  @IsOptional() @IsIsoOrTime() checkIn?: string;
  @IsOptional() @IsIsoOrTime() checkOut?: string;
  @IsOptional() @IsInt() @Min(0) overtimeMinutes?: number;
  @IsOptional() @IsString() remarks?: string;
}

export class BulkAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceItemDto)
  items!: BulkAttendanceItemDto[];
}

export class UpdateAttendanceDto {
  @IsOptional() @IsEnum(HrAttendanceStatus) status?: HrAttendanceStatus;
  @IsOptional() @IsIsoOrTime() checkIn?: string;
  @IsOptional() @IsIsoOrTime() checkOut?: string;
  @IsOptional() @IsInt() @Min(0) overtimeMinutes?: number;
  @IsOptional() @IsString() remarks?: string;
}
