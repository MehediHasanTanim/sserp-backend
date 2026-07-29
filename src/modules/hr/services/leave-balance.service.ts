import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { TxClient } from '../../../shared/prisma/transaction.helper';

type Client = PrismaService | TxClient;

@Injectable()
export class LeaveBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves the `employees.id` linked to a user account, if any. */
  async resolveEmployeeIdForUser(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true },
    });
    return user?.employeeId ?? null;
  }

  /** Fetches the balance row for (employee, leaveType, year), lazily creating it from the leave type's entitlement. */
  async getOrInit(
    employeeId: string,
    leaveTypeId: string,
    year: number,
    client: Client = this.prisma,
  ) {
    const existing = await client.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    });
    if (existing) return existing;

    const leaveType = await client.leaveType.findUnique({
      where: { id: leaveTypeId },
    });
    if (!leaveType) throw DomainException.notFound('Leave type not found');

    return client.leaveBalance.create({
      data: {
        employeeId,
        leaveTypeId,
        year,
        entitledDays: leaveType.annualEntitlementDays,
        carriedForwardDays: 0,
        consumedDays: 0,
        encashedDays: 0,
        pendingDays: 0,
      },
    });
  }

  async listForEmployee(employeeId: string, year?: number) {
    const targetYear = year ?? new Date().getUTCFullYear();
    const leaveTypes = await this.prisma.leaveType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    const balances = await Promise.all(
      leaveTypes.map((lt) => this.getOrInit(employeeId, lt.id, targetYear)),
    );
    return leaveTypes.map((lt, idx) => {
      const balance = balances[idx];
      return {
        leaveTypeId: lt.id,
        leaveTypeCode: lt.code,
        leaveTypeName: lt.name,
        year: targetYear,
        entitledDays: Number(balance.entitledDays),
        carriedForwardDays: Number(balance.carriedForwardDays),
        consumedDays: Number(balance.consumedDays),
        pendingDays: Number(balance.pendingDays),
        encashedDays: Number(balance.encashedDays),
        availableDays: this.availableDays(balance),
      };
    });
  }

  availableDays(balance: {
    entitledDays: unknown;
    carriedForwardDays: unknown;
    consumedDays: unknown;
    pendingDays: unknown;
  }): number {
    return (
      Number(balance.entitledDays) +
      Number(balance.carriedForwardDays) -
      Number(balance.consumedDays) -
      Number(balance.pendingDays)
    );
  }

  async hold(client: TxClient, balanceId: string, days: number) {
    return client.leaveBalance.update({
      where: { id: balanceId },
      data: { pendingDays: { increment: days } },
    });
  }

  async release(client: TxClient, balanceId: string, days: number) {
    return client.leaveBalance.update({
      where: { id: balanceId },
      data: { pendingDays: { decrement: days } },
    });
  }

  async consumeFromPending(client: TxClient, balanceId: string, days: number) {
    return client.leaveBalance.update({
      where: { id: balanceId },
      data: {
        pendingDays: { decrement: days },
        consumedDays: { increment: days },
      },
    });
  }

  async restoreFromConsumed(client: TxClient, balanceId: string, days: number) {
    return client.leaveBalance.update({
      where: { id: balanceId },
      data: { consumedDays: { decrement: days } },
    });
  }
}
