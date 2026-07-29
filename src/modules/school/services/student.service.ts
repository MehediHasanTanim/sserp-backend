import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';

export interface EnrollGuardianInput {
  fullName: string;
  relation: string;
  phone?: string;
  email?: string;
  occupation?: string;
  nationalId?: string;
  address?: string;
  isPrimary?: boolean;
  isEmergencyContact?: boolean;
  emergencyPriority?: number;
  portalAccessEnabled?: boolean;
}

export interface EnrollStudentInput {
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  religion?: string;
  disabilityCategory?: string;
  severityLevel?: string;
  bloodGroup?: string;
  photoAttachmentId?: string;
  previousInstitution?: string;
  previousTherapyHistory?: string;
  supportNeeds?: string;
  shiftId: string;
  academicYearId?: string;
  admissionDate?: string;
  guardians?: EnrollGuardianInput[];
}

export interface UpdateStudentInput {
  fullName?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  religion?: string;
  disabilityCategory?: string;
  severityLevel?: string;
  bloodGroup?: string;
  photoAttachmentId?: string;
  previousInstitution?: string;
  previousTherapyHistory?: string;
  supportNeeds?: string;
  shiftId?: string;
}

export interface StudentListQuery {
  page?: number;
  pageSize?: number;
  status?: StudentStatus;
  shiftId?: string;
  academicYearId?: string;
  disabilityCategory?: string;
  search?: string;
}

const DEFAULT_ADMISSION_FEE_COST_CENTER = 'school';
const ACCOUNT_AR_STUDENTS = '1200';
const ACCOUNT_ADMISSION_FEE_INCOME = '4001';

@Injectable()
export class StudentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
    private readonly ledger: LedgerPort,
  ) {}

  async list(query: StudentListQuery) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.StudentWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.shiftId) where.shiftId = query.shiftId;
    if (query.academicYearId) where.academicYearId = query.academicYearId;
    if (query.disabilityCategory)
      where.disabilityCategory = query.disabilityCategory;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { studentCode: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { shift: true },
      }),
    ]);
    return { items, page, pageSize, total };
  }

  async listForStudentIds(studentIds: string[]) {
    if (!studentIds.length) return [];
    return this.prisma.student.findMany({
      where: { id: { in: studentIds }, deletedAt: null },
    });
  }

  async get(id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      include: {
        shift: true,
        academicYear: true,
        guardians: true,
        documents: true,
        admissionFee: true,
        enrollments: { orderBy: { enrollmentDate: 'desc' } },
        mappings: { where: { isActive: true } },
      },
    });
    if (!student) throw DomainException.notFound('Student not found');
    return student;
  }

  private async requireStudent(
    id: string,
    client: TxClient | PrismaService = this.prisma,
  ) {
    const student = await client.student.findFirst({
      where: { id, deletedAt: null },
    });
    if (!student) throw DomainException.notFound('Student not found');
    return student;
  }

  private async resolveAdmissionFeeAmount(
    tx: TxClient,
    academicYearId: string,
    studentCategory?: string,
  ): Promise<number> {
    if (studentCategory) {
      const specific = await tx.admissionFeeSetting.findFirst({
        where: { academicYearId, studentCategory, isActive: true },
      });
      if (specific) return specific.amount;
    }
    const global = await tx.admissionFeeSetting.findFirst({
      where: { academicYearId, studentCategory: null, isActive: true },
    });
    if (global) return global.amount;
    throw DomainException.notFound(
      'No admission fee setting configured for this academic year',
    );
  }

  /**
   * S-01: enrollment creates the student, its first enrollment row, and a
   * pending admission fee — all in one transaction — then posts the AR
   * invoice via `LedgerPort` and emits `student.enrolled`.
   */
  async enroll(input: EnrollStudentInput, actorId: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: input.shiftId },
    });
    if (!shift) throw DomainException.notFound('Shift not found');

    let academicYearId = input.academicYearId;
    if (!academicYearId) {
      const current = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
      });
      if (!current) {
        throw DomainException.notFound('No current academic year set');
      }
      academicYearId = current.id;
    }

    const enrollmentDate = input.admissionDate
      ? new Date(input.admissionDate)
      : new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const studentCode = await this.numbering.nextCode('student', tx);

      const student = await tx.student.create({
        data: {
          studentCode,
          fullName: input.fullName,
          dateOfBirth: input.dateOfBirth
            ? new Date(input.dateOfBirth)
            : undefined,
          gender: input.gender,
          nationality: input.nationality,
          religion: input.religion,
          disabilityCategory: input.disabilityCategory,
          severityLevel: input.severityLevel,
          bloodGroup: input.bloodGroup,
          photoAttachmentId: input.photoAttachmentId,
          previousInstitution: input.previousInstitution,
          previousTherapyHistory: input.previousTherapyHistory,
          supportNeeds: input.supportNeeds,
          shiftId: input.shiftId,
          academicYearId,
          status: 'pending_admission_fee',
          admissionDate: enrollmentDate,
          enrollmentDate,
          createdBy: actorId,
          guardians: input.guardians?.length
            ? {
                create: input.guardians.map((g) => ({
                  fullName: g.fullName,
                  relation: g.relation,
                  phone: g.phone,
                  email: g.email,
                  occupation: g.occupation,
                  nationalId: g.nationalId,
                  address: g.address,
                  isPrimary: g.isPrimary ?? false,
                  isEmergencyContact: g.isEmergencyContact ?? false,
                  emergencyPriority: g.emergencyPriority,
                  portalAccessEnabled: g.portalAccessEnabled ?? false,
                })),
              }
            : undefined,
        },
      });

      await tx.studentEnrollment.create({
        data: {
          studentId: student.id,
          academicYearId,
          shiftId: input.shiftId,
          enrollmentDate,
          status: 'enrolled',
        },
      });

      const amount = await this.resolveAdmissionFeeAmount(
        tx,
        academicYearId!,
        input.disabilityCategory,
      );

      const admissionFee = await tx.admissionFee.create({
        data: {
          studentId: student.id,
          amount,
          status: 'pending',
          invoiceDate: enrollmentDate,
        },
      });

      return { student, admissionFee };
    });

    await this.ledger.post({
      referenceType: 'admission_fee',
      referenceId: result.admissionFee.id,
      amount: result.admissionFee.amount,
      costCenter: DEFAULT_ADMISSION_FEE_COST_CENTER,
      description: `Admission fee invoice for ${result.student.studentCode}`,
      debitAccountCode: ACCOUNT_AR_STUDENTS,
      creditAccountCode: ACCOUNT_ADMISSION_FEE_INCOME,
      postingDate: enrollmentDate,
    });

    await this.events.emitAsync(EventNames.STUDENT_ENROLLED, {
      studentId: result.student.id,
      studentCode: result.student.studentCode,
      academicYearId,
      shiftId: input.shiftId,
    });

    return result.student;
  }

  async update(id: string, input: UpdateStudentInput, actorId: string) {
    await this.requireStudent(id);
    return this.prisma.student.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
  }

  async softDelete(id: string, actorId: string) {
    await this.requireStudent(id);
    return this.prisma.student.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorId },
    });
  }

  /** S-09: re-enrollment creates a new enrollment row and never mutates history. */
  async reEnroll(
    id: string,
    input: { academicYearId: string; shiftId: string; enrollmentDate: string },
  ) {
    await this.requireStudent(id);
    const shift = await this.prisma.shift.findUnique({
      where: { id: input.shiftId },
    });
    if (!shift) throw DomainException.notFound('Shift not found');
    const year = await this.prisma.academicYear.findUnique({
      where: { id: input.academicYearId },
    });
    if (!year) throw DomainException.notFound('Academic year not found');

    return this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.studentEnrollment.create({
        data: {
          studentId: id,
          academicYearId: input.academicYearId,
          shiftId: input.shiftId,
          enrollmentDate: new Date(input.enrollmentDate),
          status: 'enrolled',
        },
      });
      await tx.student.update({
        where: { id },
        data: {
          shiftId: input.shiftId,
          academicYearId: input.academicYearId,
        },
      });
      return enrollment;
    });
  }

  async listGuardians(studentId: string) {
    await this.requireStudent(studentId);
    return this.prisma.studentGuardian.findMany({ where: { studentId } });
  }

  async addGuardian(studentId: string, input: EnrollGuardianInput) {
    await this.requireStudent(studentId);
    return this.prisma.studentGuardian.create({
      data: { studentId, ...input },
    });
  }

  async updateGuardian(
    studentId: string,
    guardianId: string,
    input: Partial<EnrollGuardianInput>,
  ) {
    const guardian = await this.prisma.studentGuardian.findFirst({
      where: { id: guardianId, studentId },
    });
    if (!guardian) throw DomainException.notFound('Guardian not found');
    return this.prisma.studentGuardian.update({
      where: { id: guardianId },
      data: input,
    });
  }

  async removeGuardian(studentId: string, guardianId: string) {
    const guardian = await this.prisma.studentGuardian.findFirst({
      where: { id: guardianId, studentId },
    });
    if (!guardian) throw DomainException.notFound('Guardian not found');
    await this.prisma.studentGuardian.delete({ where: { id: guardianId } });
    return { ok: true };
  }

  async listDocuments(studentId: string) {
    await this.requireStudent(studentId);
    return this.prisma.studentDocument.findMany({ where: { studentId } });
  }

  async addDocument(
    studentId: string,
    input: {
      documentType: string;
      attachmentId: string;
      issuedDate?: string;
      notes?: string;
    },
  ) {
    await this.requireStudent(studentId);
    return this.prisma.studentDocument.create({
      data: {
        studentId,
        documentType: input.documentType as never,
        attachmentId: input.attachmentId,
        issuedDate: input.issuedDate ? new Date(input.issuedDate) : undefined,
        notes: input.notes,
      },
    });
  }
}
