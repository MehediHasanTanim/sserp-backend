import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

@Injectable()
export class PayslipService {
  constructor(private readonly prisma: PrismaService) {}

  listForEmployee(employeeId: string) {
    return this.listByEmployee(employeeId);
  }

  listByEmployee(employeeId: string) {
    return this.prisma.payrollSlip.findMany({
      where: { employeeId },
      include: {
        payrollRun: {
          select: {
            id: true,
            periodMonth: true,
            periodYear: true,
            status: true,
            runNumber: true,
          },
        },
        lines: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSlip(slipId: string) {
    const slip = await this.prisma.payrollSlip.findUnique({
      where: { id: slipId },
      include: {
        lines: true,
        employee: true,
        payrollRun: true,
      },
    });
    if (!slip) throw DomainException.notFound('Payslip not found');
    return slip;
  }

  /** Stub: PDF rendering is queued separately; returns attachment metadata when present. */
  async getDocument(slipId: string) {
    const slip = await this.getSlip(slipId);
    if (!slip.documentAttachmentId) {
      return {
        slipId,
        status: 'pending' as const,
        documentAttachmentId: null,
        message: 'Payslip PDF not yet generated',
      };
    }
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: slip.documentAttachmentId },
    });
    return {
      slipId,
      status: 'ready' as const,
      documentAttachmentId: slip.documentAttachmentId,
      attachment,
    };
  }
}

@Injectable()
export class PayrollAdjustmentService {
  constructor(private readonly prisma: PrismaService) {}

  list(filters?: { employeeId?: string; year?: number; month?: number }) {
    return this.prisma.payrollAdjustment.findMany({
      where: {
        employeeId: filters?.employeeId,
        periodYear: filters?.year,
        periodMonth: filters?.month,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: {
    employeeId: string;
    periodMonth: number;
    periodYear: number;
    adjustmentType: 'addition' | 'deduction';
    label: string;
    amount: number;
    reason?: string;
  }) {
    return this.prisma.payrollAdjustment.create({
      data: {
        ...data,
        sourceType: 'manual',
        status: 'pending',
      },
    });
  }
}
