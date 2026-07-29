import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';
import { StudentStatusService } from './student-status.service';

export interface PayAdmissionFeeInput {
  amount: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  attachmentId?: string;
}

export interface WaiveAdmissionFeeInput {
  reason: string;
  actorId: string;
  actorRoles: string[];
}

const COST_CENTER = 'school';
const ACCOUNT_AR_STUDENTS = '1200';
const ACCOUNT_CASH = '1010';
const ACCOUNT_BANK = '1020';
const ACCOUNT_WAIVER_EXPENSE = '5090';
const WAIVER_ROLES = ['principal', 'super_admin'];

@Injectable()
export class AdmissionFeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
    private readonly ledger: LedgerPort,
    private readonly studentStatus: StudentStatusService,
  ) {}

  async getForStudent(studentId: string) {
    const fee = await this.prisma.admissionFee.findUnique({
      where: { studentId },
    });
    if (!fee) throw DomainException.notFound('Admission fee not found');
    return fee;
  }

  /**
   * S-03/S-04/S-05: full payment only, atomically activating the student.
   */
  async pay(studentId: string, input: PayAdmissionFeeInput, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const fee = await tx.admissionFee.findUnique({ where: { studentId } });
      if (!fee) throw DomainException.notFound('Admission fee not found');

      if (fee.status === 'paid' || fee.status === 'waived') {
        throw DomainException.conflict(
          `Admission fee is already ${fee.status}`,
        );
      }

      const student = await tx.student.findFirst({
        where: { id: studentId, deletedAt: null },
      });
      if (!student) throw DomainException.notFound('Student not found');
      if (student.status === 'active') {
        throw DomainException.conflict('Student is already active');
      }

      if (input.amount !== fee.amount) {
        throw DomainException.withCode(
          ErrorCode.PARTIAL_PAYMENT_NOT_ALLOWED,
          422,
          `The admission fee must be paid in full. Outstanding amount is ${fee.amount}, received ${input.amount}`,
        );
      }

      const receiptNumber = await this.numbering.nextCode('receipt', tx);
      const paidDate = new Date();

      const updatedFee = await tx.admissionFee.update({
        where: { studentId },
        data: {
          status: 'paid',
          paidDate,
          paidAmount: input.amount,
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
          receiptNumber,
          recordedBy: actorId,
          attachmentId: input.attachmentId,
        },
      });

      await this.studentStatus.changeStatus(
        {
          studentId,
          toStatus: 'active',
          changedBy: actorId,
          reason: 'Admission fee paid in full',
          isManualOverride: false,
          trigger: 'admission_fee_paid',
        },
        tx,
      );

      return { fee: updatedFee, paidDate };
    });

    const debitAccountCode =
      input.paymentMethod === 'cash' ? ACCOUNT_CASH : ACCOUNT_BANK;
    await this.ledger.post({
      referenceType: 'admission_fee',
      referenceId: result.fee.id,
      amount: input.amount,
      costCenter: COST_CENTER,
      description: `Admission fee payment (${input.paymentMethod})`,
      debitAccountCode,
      creditAccountCode: ACCOUNT_AR_STUDENTS,
      postingDate: result.paidDate,
    });

    await this.events.emitAsync(EventNames.ADMISSION_FEE_PAID, {
      studentId,
      admissionFeeId: result.fee.id,
      amount: input.amount,
      method: input.paymentMethod,
      receiptNumber: result.fee.receiptNumber,
      paidDate: result.paidDate,
      recordedBy: actorId,
    });

    return result.fee;
  }

  /** S-06: waiver requires principal/super_admin and a non-empty reason. */
  async waive(studentId: string, input: WaiveAdmissionFeeInput) {
    if (!input.actorRoles.some((r) => WAIVER_ROLES.includes(r))) {
      throw DomainException.forbidden(
        'Only a principal or super admin may waive an admission fee',
      );
    }
    if (!input.reason || !input.reason.trim()) {
      throw DomainException.validation('A reason is required to waive a fee');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const fee = await tx.admissionFee.findUnique({ where: { studentId } });
      if (!fee) throw DomainException.notFound('Admission fee not found');
      if (fee.status === 'paid' || fee.status === 'waived') {
        throw DomainException.conflict(
          `Admission fee is already ${fee.status}`,
        );
      }
      const student = await tx.student.findFirst({
        where: { id: studentId, deletedAt: null },
      });
      if (!student) throw DomainException.notFound('Student not found');
      if (student.status === 'active') {
        throw DomainException.conflict('Student is already active');
      }

      const updatedFee = await tx.admissionFee.update({
        where: { studentId },
        data: {
          status: 'waived',
          waiverReason: input.reason,
          waiverApprovedBy: input.actorId,
        },
      });

      await this.studentStatus.changeStatus(
        {
          studentId,
          toStatus: 'active',
          changedBy: input.actorId,
          reason: `Admission fee waived: ${input.reason}`,
          isManualOverride: false,
          trigger: 'admission_fee_waived',
        },
        tx,
      );

      return updatedFee;
    });

    await this.ledger.post({
      referenceType: 'admission_fee',
      referenceId: result.id,
      amount: result.amount,
      costCenter: COST_CENTER,
      description: `Admission fee waiver: ${input.reason}`,
      debitAccountCode: ACCOUNT_WAIVER_EXPENSE,
      creditAccountCode: ACCOUNT_AR_STUDENTS,
      postingDate: new Date(),
    });

    await this.events.emitAsync(EventNames.ADMISSION_FEE_WAIVED, {
      studentId,
      admissionFeeId: result.id,
      amount: result.amount,
      reason: input.reason,
      approvedBy: input.actorId,
    });

    return result;
  }

  async listSettings(academicYearId?: string) {
    return this.prisma.admissionFeeSetting.findMany({
      where: academicYearId ? { academicYearId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSetting(input: {
    academicYearId: string;
    studentCategory?: string;
    amount: number;
    isActive?: boolean;
  }) {
    // Compound-unique lookups can't carry a null `studentCategory` without
    // the `extendedWhereUnique` preview feature, so resolve manually.
    const existing = await this.prisma.admissionFeeSetting.findFirst({
      where: {
        academicYearId: input.academicYearId,
        studentCategory: input.studentCategory ?? null,
      },
    });
    if (existing) {
      return this.prisma.admissionFeeSetting.update({
        where: { id: existing.id },
        data: { amount: input.amount, isActive: input.isActive ?? true },
      });
    }
    return this.prisma.admissionFeeSetting.create({
      data: {
        academicYearId: input.academicYearId,
        studentCategory: input.studentCategory,
        amount: input.amount,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateSetting(
    id: string,
    input: { amount?: number; isActive?: boolean },
  ) {
    const existing = await this.prisma.admissionFeeSetting.findUnique({
      where: { id },
    });
    if (!existing) throw DomainException.notFound('Fee setting not found');
    return this.prisma.admissionFeeSetting.update({
      where: { id },
      data: input,
    });
  }
}
