import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TherapyType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { SchoolStudentReadService } from '../../school/services/school-student-read.service';

export interface CreatePatientFromStudentDto {
  studentId: string;
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  panelDetails?: Record<string, unknown>;
}

export interface CreateExternalPatientDto {
  fullName: string;
  dateOfBirth?: Date;
  gender?: string;
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  panelDetails?: Record<string, unknown>;
}

export interface CreateReferralDto {
  patientId: string;
  referralSource: 'self' | 'doctor' | 'school' | 'other';
  referrerName?: string;
  referrerContact?: string;
  referralDate: Date;
  referredForTherapyTypes: TherapyType[];
  parentReferralId?: string;
  attachmentId?: string;
  notes?: string;
}

export interface DischargePatientDto {
  patientId: string;
  dischargeDate: Date;
  dischargeReason: string;
}

@Injectable()
export class PatientService {
  private readonly logger = new Logger(PatientService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingService: NumberingService,
    private readonly studentRead: SchoolStudentReadService,
    private readonly events: EventEmitter2,
  ) {}

  async createFromStudent(dto: CreatePatientFromStudentDto, createdBy: string) {
    // Validate student exists and is active
    const student = await this.studentRead.findActiveById(dto.studentId);
    if (student.status !== 'active') {
      throw new DomainException(
        ErrorCode.PATIENT_NOT_ACTIVE,
        422,
        `Student ${student.fullName} is not active`,
      );
    }

    const existing = await this.prisma.patient.findFirst({
      where: { studentId: dto.studentId, deletedAt: null },
    });
    if (existing)
      throw DomainException.conflict(
        'Patient profile already exists for this student',
      );

    const patientCode = await this.numberingService.nextCode('patient');

    const patient = await this.prisma.patient.create({
      data: {
        patientCode,
        studentId: dto.studentId,
        // fullName/dateOfBirth/gender are read-through from SchoolStudentReadService
        guardianName: dto.guardianName,
        guardianRelation: dto.guardianRelation,
        guardianPhone: dto.guardianPhone,
        guardianEmail: dto.guardianEmail,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        insuranceProvider: dto.insuranceProvider,
        insurancePolicyNumber: dto.insurancePolicyNumber,
        panelDetails: dto.panelDetails as Prisma.InputJsonValue,
        createdBy,
      },
    });

    this.events.emit(EventNames.PATIENT_CREATED, {
      patientId: patient.id,
      studentId: dto.studentId,
      createdBy,
    });
    return patient;
  }

  async createExternal(dto: CreateExternalPatientDto, createdBy: string) {
    if (!dto.fullName)
      throw DomainException.validation(
        'fullName is required for external patients',
      );

    const patientCode = await this.numberingService.nextCode('patient');

    const patient = await this.prisma.patient.create({
      data: {
        patientCode,
        fullName: dto.fullName,
        dateOfBirth: dto.dateOfBirth,
        gender: dto.gender,
        guardianName: dto.guardianName,
        guardianRelation: dto.guardianRelation,
        guardianPhone: dto.guardianPhone,
        guardianEmail: dto.guardianEmail,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        insuranceProvider: dto.insuranceProvider,
        insurancePolicyNumber: dto.insurancePolicyNumber,
        panelDetails: dto.panelDetails as Prisma.InputJsonValue,
        createdBy,
      },
    });

    this.events.emit(EventNames.PATIENT_CREATED, {
      patientId: patient.id,
      createdBy,
    });
    return patient;
  }

  async findById(id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, deletedAt: null },
      include: {
        medicalHistory: true,
        consents: true,
        referrals: { orderBy: { referralDate: 'desc' } },
      },
    });
    if (!patient) throw DomainException.notFound('Patient not found');
    return patient;
  }

  async findByIdWithStudentInfo(id: string) {
    const patient = await this.findById(id);
    if (patient.studentId) {
      const student = await this.studentRead
        .findActiveById(patient.studentId)
        .catch(() => null);
      return { ...patient, studentInfo: student };
    }
    return { ...patient, studentInfo: null };
  }

  async list(filter?: { status?: string; therapyType?: TherapyType }) {
    return this.prisma.patient.findMany({
      where: {
        deletedAt: null,
        ...(filter?.status ? { status: filter.status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateMedicalHistory(
    patientId: string,
    data: {
      existingConditions?: Record<string, unknown>;
      medications?: Record<string, unknown>;
      allergies?: Record<string, unknown>;
      pastTherapyHistory?: string;
    },
    updatedBy: string,
  ) {
    await this.findById(patientId);
    return this.prisma.patientMedicalHistory.upsert({
      where: { patientId },
      create: {
        patientId,
        existingConditions: data.existingConditions as Prisma.InputJsonValue,
        medications: data.medications as Prisma.InputJsonValue,
        allergies: data.allergies as Prisma.InputJsonValue,
        pastTherapyHistory: data.pastTherapyHistory,
        updatedBy,
      },
      update: {
        existingConditions: data.existingConditions as Prisma.InputJsonValue,
        medications: data.medications as Prisma.InputJsonValue,
        allergies: data.allergies as Prisma.InputJsonValue,
        pastTherapyHistory: data.pastTherapyHistory,
        updatedBy,
      },
    });
  }

  async addConsent(
    patientId: string,
    data: {
      consentType: 'therapy' | 'media' | 'data_sharing';
      attachmentId?: string;
      signedBy: string;
      signedDate: Date;
      expiryDate?: Date;
    },
  ) {
    await this.findById(patientId);
    return this.prisma.patientConsent.create({
      data: { patientId, ...data },
    });
  }

  async addReferral(dto: CreateReferralDto) {
    await this.findById(dto.patientId);
    return this.prisma.referral.create({
      data: {
        patientId: dto.patientId,
        referralSource: dto.referralSource,
        referrerName: dto.referrerName,
        referrerContact: dto.referrerContact,
        referralDate: dto.referralDate,
        referredForTherapyTypes: dto.referredForTherapyTypes,
        parentReferralId: dto.parentReferralId,
        attachmentId: dto.attachmentId,
        notes: dto.notes,
      },
    });
  }

  async discharge(dto: DischargePatientDto, dischargedBy: string) {
    const patient = await this.findById(dto.patientId);
    if (patient.status === 'discharged') {
      throw DomainException.conflict('Patient is already discharged');
    }

    const updated = await this.prisma.patient.update({
      where: { id: dto.patientId },
      data: {
        status: 'discharged',
        dischargeDate: dto.dischargeDate,
        dischargeReason: dto.dischargeReason,
      },
    });

    this.events.emit(EventNames.PATIENT_DISCHARGED, {
      patientId: dto.patientId,
      dischargeDate: dto.dischargeDate,
      dischargedBy,
    });

    return updated;
  }
}
