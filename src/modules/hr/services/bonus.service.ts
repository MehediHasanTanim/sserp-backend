import { Injectable } from '@nestjs/common';
import { BonusType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

@Injectable()
export class BonusService {
  constructor(private readonly prisma: PrismaService) {}

  list(filters?: { employeeId?: string; year?: number; status?: string }) {
    return this.prisma.bonus.findMany({
      where: {
        employeeId: filters?.employeeId,
        applicableYear: filters?.year,
        status: filters?.status as never,
      },
      orderBy: [
        { applicableYear: 'desc' },
        { applicableMonth: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true } },
      },
    });
  }

  async create(input: {
    employeeId: string;
    bonusType: BonusType;
    amount: number;
    applicableMonth: number;
    applicableYear: number;
    reason?: string;
  }) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, deletedAt: null },
    });
    if (!employee) throw DomainException.notFound('Employee not found');
    if (input.amount <= 0) {
      throw DomainException.validation('Bonus amount must be positive');
    }
    return this.prisma.bonus.create({
      data: {
        employeeId: input.employeeId,
        bonusType: input.bonusType,
        amount: input.amount,
        applicableMonth: input.applicableMonth,
        applicableYear: input.applicableYear,
        reason: input.reason,
        status: 'pending',
      },
    });
  }

  async approve(id: string, actorId: string) {
    const bonus = await this.prisma.bonus.findUnique({ where: { id } });
    if (!bonus) throw DomainException.notFound('Bonus not found');
    if (bonus.status !== 'pending') {
      throw DomainException.conflict('Only pending bonuses can be approved');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bonus.update({
        where: { id },
        data: { status: 'approved', approvedBy: actorId },
      });
      await tx.payrollAdjustment.create({
        data: {
          employeeId: bonus.employeeId,
          periodMonth: bonus.applicableMonth,
          periodYear: bonus.applicableYear,
          adjustmentType: 'addition',
          label: `Bonus (${bonus.bonusType})`,
          amount: bonus.amount,
          reason: bonus.reason,
          sourceType: 'manual',
          sourceId: bonus.id,
          status: 'pending',
        },
      });
      return updated;
    });
  }
}
