import { Injectable } from '@nestjs/common';
import {
  EmployeeDocumentType,
  ExitType,
  HrDepartment,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

export interface TransferInput {
  department?: HrDepartment;
  designation?: string;
  reportingManagerId?: string;
  effectiveDate: string;
  reason: string;
}

export interface ExitInput {
  exitType: ExitType;
  noticeDate: string;
  lastWorkingDay: string;
  exitInterviewNotes?: string;
  clearanceChecklist?: Record<string, unknown>;
}

export interface CreateDocumentInput {
  documentType: EmployeeDocumentType;
  attachmentId: string;
  issuedDate?: string;
  expiryDate?: string;
  notes?: string;
}

export interface CreateContractInput {
  contractType: string;
  startDate: string;
  endDate?: string;
  attachmentId?: string;
  isCurrent?: boolean;
}

/**
 * Probation, transfer, exit, document vault and contract lifecycle for an
 * employee. `EmployeeService` owns plain CRUD; this service owns the
 * workflow actions that always append `employee_history`.
 */
@Injectable()
export class EmployeeLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireEmployee(
    id: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const employee = await tx.employee.findFirst({
      where: { id, deletedAt: null },
    });
    if (!employee) throw DomainException.notFound('Employee not found');
    return employee;
  }

  async confirmProbation(
    id: string,
    actorId: string,
    confirmationDate?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await this.requireEmployee(id, tx);
      if (employee.status !== 'on_probation') {
        throw DomainException.conflict(
          'Employee is not currently on probation',
        );
      }
      const effectiveDate = confirmationDate
        ? new Date(confirmationDate)
        : new Date();
      const updated = await tx.employee.update({
        where: { id },
        data: {
          confirmationDate: effectiveDate,
          status: 'active',
          updatedBy: actorId,
        },
      });
      await tx.employeeHistory.create({
        data: {
          employeeId: id,
          changeType: 'status_change',
          effectiveDate,
          fromValue: { status: employee.status },
          toValue: { status: 'active' },
          reason: 'Probation confirmed',
          recordedBy: actorId,
        },
      });
      return updated;
    });
  }

  async transfer(id: string, input: TransferInput, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await this.requireEmployee(id, tx);
      if (
        !input.department &&
        !input.designation &&
        !input.reportingManagerId
      ) {
        throw DomainException.validation(
          'At least one of department, designation, or reportingManagerId must change',
        );
      }
      const data: Prisma.EmployeeUpdateInput = { updatedBy: actorId };
      if (input.department) data.department = input.department;
      if (input.designation) data.designation = input.designation;
      if (input.reportingManagerId !== undefined) {
        data.reportingManager = { connect: { id: input.reportingManagerId } };
      }
      const updated = await tx.employee.update({ where: { id }, data });
      await tx.employeeHistory.create({
        data: {
          employeeId: id,
          changeType: 'transfer',
          effectiveDate: new Date(input.effectiveDate),
          fromValue: {
            department: employee.department,
            designation: employee.designation,
            reportingManagerId: employee.reportingManagerId,
          },
          toValue: {
            department: updated.department,
            designation: updated.designation,
            reportingManagerId: updated.reportingManagerId,
          },
          reason: input.reason,
          recordedBy: actorId,
        },
      });
      return updated;
    });
  }

  async exit(id: string, input: ExitInput, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await this.requireEmployee(id, tx);
      const existingExit = await tx.employeeExit.findUnique({
        where: { employeeId: id },
      });
      if (existingExit) {
        throw DomainException.conflict(
          'Exit already initiated for this employee',
        );
      }
      const exit = await tx.employeeExit.create({
        data: {
          employeeId: id,
          exitType: input.exitType,
          noticeDate: new Date(input.noticeDate),
          lastWorkingDay: new Date(input.lastWorkingDay),
          exitInterviewNotes: input.exitInterviewNotes,
          clearanceChecklist: input.clearanceChecklist as
            Prisma.InputJsonValue | undefined,
          status: 'in_progress',
        },
      });
      const updated = await tx.employee.update({
        where: { id },
        data: { status: 'on_notice', updatedBy: actorId },
      });
      await tx.employeeHistory.create({
        data: {
          employeeId: id,
          changeType: 'status_change',
          effectiveDate: new Date(input.noticeDate),
          fromValue: { status: employee.status },
          toValue: { status: 'on_notice' },
          reason: `Exit initiated: ${input.exitType}`,
          recordedBy: actorId,
        },
      });
      return { exit, employee: updated };
    });
  }

  async history(employeeId: string) {
    await this.requireEmployee(employeeId);
    return this.prisma.employeeHistory.findMany({
      where: { employeeId },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  // ---- Documents -----------------------------------------------------

  async listDocuments(employeeId: string) {
    await this.requireEmployee(employeeId);
    return this.prisma.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addDocument(employeeId: string, input: CreateDocumentInput) {
    await this.requireEmployee(employeeId);
    return this.prisma.employeeDocument.create({
      data: {
        employeeId,
        documentType: input.documentType,
        attachmentId: input.attachmentId,
        issuedDate: input.issuedDate ? new Date(input.issuedDate) : undefined,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
        notes: input.notes,
      },
    });
  }

  async updateDocument(
    employeeId: string,
    documentId: string,
    input: Partial<CreateDocumentInput>,
  ) {
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, employeeId },
    });
    if (!doc) throw DomainException.notFound('Document not found');
    return this.prisma.employeeDocument.update({
      where: { id: documentId },
      data: {
        documentType: input.documentType,
        attachmentId: input.attachmentId,
        issuedDate: input.issuedDate ? new Date(input.issuedDate) : undefined,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
        notes: input.notes,
      },
    });
  }

  async removeDocument(employeeId: string, documentId: string) {
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, employeeId },
    });
    if (!doc) throw DomainException.notFound('Document not found');
    await this.prisma.employeeDocument.delete({ where: { id: documentId } });
    return { ok: true };
  }

  // ---- Contracts -------------------------------------------------------

  async listContracts(employeeId: string) {
    await this.requireEmployee(employeeId);
    return this.prisma.employeeContract.findMany({
      where: { employeeId },
      orderBy: { startDate: 'desc' },
    });
  }

  async addContract(employeeId: string, input: CreateContractInput) {
    await this.requireEmployee(employeeId);
    const isCurrent = input.isCurrent ?? true;
    return this.prisma.$transaction(async (tx) => {
      if (isCurrent) {
        await tx.employeeContract.updateMany({
          where: { employeeId, isCurrent: true },
          data: { isCurrent: false },
        });
      }
      return tx.employeeContract.create({
        data: {
          employeeId,
          contractType: input.contractType,
          startDate: new Date(input.startDate),
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          attachmentId: input.attachmentId,
          isCurrent,
        },
      });
    });
  }

  async updateContract(
    employeeId: string,
    contractId: string,
    input: Partial<CreateContractInput>,
  ) {
    const contract = await this.prisma.employeeContract.findFirst({
      where: { id: contractId, employeeId },
    });
    if (!contract) throw DomainException.notFound('Contract not found');
    return this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.employeeContract.updateMany({
          where: { employeeId, isCurrent: true, id: { not: contractId } },
          data: { isCurrent: false },
        });
      }
      return tx.employeeContract.update({
        where: { id: contractId },
        data: {
          contractType: input.contractType,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          attachmentId: input.attachmentId,
          isCurrent: input.isCurrent,
        },
      });
    });
  }

  async removeContract(employeeId: string, contractId: string) {
    const contract = await this.prisma.employeeContract.findFirst({
      where: { id: contractId, employeeId },
    });
    if (!contract) throw DomainException.notFound('Contract not found');
    await this.prisma.employeeContract.delete({ where: { id: contractId } });
    return { ok: true };
  }
}
