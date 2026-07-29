import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TherapyType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { HrEmployeeReadService } from '../../hr/services/hr-employee-read.service';

const GROUP_SUPPORTING_TYPES: TherapyType[] = ['ot', 'speech', 'music', 'dance'];

function deriveSupportsGroup(therapyType: TherapyType): boolean {
  return GROUP_SUPPORTING_TYPES.includes(therapyType);
}

export interface CreateTherapistDto {
  employeeId: string;
  licenseNumber?: string;
  availabilityNotes?: string;
  contractEndDate?: Date;
  supportsSupervision?: boolean;
  supervisorTherapistId?: string;
}

export interface AddSpecializationDto {
  therapistId: string;
  therapyType: TherapyType;
}

export interface AddLicenseDto {
  therapistId: string;
  licenseType: string;
  licenseNumber: string;
  issuingAuthority: string;
  issuedDate: Date;
  expiryDate?: Date;
  attachmentId?: string;
}

export interface SetAvailabilityDto {
  therapistId: string;
  slots: Array<{
    dayOfWeek: number;
    startTime: Date;
    endTime: Date;
    effectiveFrom: Date;
    effectiveTo?: Date;
  }>;
}

@Injectable()
export class TherapistService {
  private readonly logger = new Logger(TherapistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hrEmployeeRead: HrEmployeeReadService,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateTherapistDto, createdBy: string) {
    // Validate employee exists in HR
    const employee = await this.hrEmployeeRead.findById(dto.employeeId);
    if (employee.status !== 'active' && employee.status !== 'on_probation') {
      throw new DomainException(
        ErrorCode.THERAPIST_NOT_ACTIVE,
        422,
        `Employee ${employee.fullName} is not active`,
      );
    }

    const existing = await this.prisma.therapist.findFirst({
      where: { employeeId: dto.employeeId, deletedAt: null },
    });
    if (existing) throw DomainException.conflict('Therapist profile already exists for this employee');

    const therapist = await this.prisma.therapist.create({
      data: {
        employeeId: dto.employeeId,
        licenseNumber: dto.licenseNumber,
        availabilityNotes: dto.availabilityNotes,
        contractEndDate: dto.contractEndDate,
        supportsSupervision: dto.supportsSupervision ?? false,
        supervisorTherapistId: dto.supervisorTherapistId,
      },
    });

    this.events.emit(EventNames.THERAPIST_CREATED, { therapistId: therapist.id, createdBy });
    return therapist;
  }

  async findById(id: string) {
    const therapist = await this.prisma.therapist.findFirst({
      where: { id, deletedAt: null },
      include: {
        specializations: true,
        licenses: true,
        availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      },
    });
    if (!therapist) throw DomainException.notFound('Therapist not found');
    return therapist;
  }

  async list(activeOnly = true) {
    return this.prisma.therapist.findMany({
      where: { deletedAt: null },
      include: { specializations: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addSpecialization(dto: AddSpecializationDto) {
    await this.findById(dto.therapistId);
    const supportsGroup = deriveSupportsGroup(dto.therapyType);

    try {
      return await this.prisma.therapistSpecialization.create({
        data: {
          therapistId: dto.therapistId,
          therapyType: dto.therapyType,
          supportsGroup,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw DomainException.conflict('Specialization already exists for this therapist');
      }
      throw e;
    }
  }

  async removeSpecialization(therapistId: string, therapyType: TherapyType) {
    const spec = await this.prisma.therapistSpecialization.findFirst({
      where: { therapistId, therapyType },
    });
    if (!spec) throw DomainException.notFound('Specialization not found');
    await this.prisma.therapistSpecialization.delete({ where: { id: spec.id } });
  }

  async addLicense(dto: AddLicenseDto) {
    await this.findById(dto.therapistId);
    return this.prisma.therapistLicense.create({
      data: {
        therapistId: dto.therapistId,
        licenseType: dto.licenseType,
        licenseNumber: dto.licenseNumber,
        issuingAuthority: dto.issuingAuthority,
        issuedDate: dto.issuedDate,
        expiryDate: dto.expiryDate,
        attachmentId: dto.attachmentId,
        status: 'valid',
      },
    });
  }

  async updateLicenseStatus(licenseId: string, status: 'valid' | 'expiring' | 'expired') {
    return this.prisma.therapistLicense.update({
      where: { id: licenseId },
      data: { status },
    });
  }

  async setAvailability(dto: SetAvailabilityDto) {
    await this.findById(dto.therapistId);

    return this.prisma.$transaction(async (tx) => {
      await tx.therapistAvailability.deleteMany({
        where: { therapistId: dto.therapistId },
      });
      return tx.therapistAvailability.createMany({
        data: dto.slots.map((s) => ({
          therapistId: dto.therapistId,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          effectiveFrom: s.effectiveFrom,
          effectiveTo: s.effectiveTo,
        })),
      });
    });
  }

  async softDelete(id: string) {
    await this.findById(id);
    return this.prisma.therapist.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
