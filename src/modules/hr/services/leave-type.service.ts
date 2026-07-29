import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

export interface CreateLeaveTypeInput {
  code: string;
  name: string;
  isPaid?: boolean;
  annualEntitlementDays: number;
  carryForwardAllowed?: boolean;
  maxCarryForwardDays?: number;
  requiresMedicalCertificateAfterDays?: number;
  isEncashable?: boolean;
  maxEncashableDaysPerYear?: number;
  minBalanceToRetain?: number;
  appliesToEmploymentTypes?: string[];
  isActive?: boolean;
}

export type UpdateLeaveTypeInput = Partial<Omit<CreateLeaveTypeInput, 'code'>>;

@Injectable()
export class LeaveTypeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(includeInactive = false) {
    return this.prisma.leaveType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!leaveType) throw DomainException.notFound('Leave type not found');
    return leaveType;
  }

  async create(input: CreateLeaveTypeInput) {
    const existing = await this.prisma.leaveType.findUnique({
      where: { code: input.code },
    });
    if (existing)
      throw DomainException.conflict(`Leave type ${input.code} already exists`);
    return this.prisma.leaveType.create({
      data: {
        code: input.code,
        name: input.name,
        isPaid: input.isPaid ?? true,
        annualEntitlementDays: input.annualEntitlementDays,
        carryForwardAllowed: input.carryForwardAllowed ?? false,
        maxCarryForwardDays: input.maxCarryForwardDays ?? 0,
        requiresMedicalCertificateAfterDays:
          input.requiresMedicalCertificateAfterDays,
        isEncashable: input.isEncashable ?? false,
        maxEncashableDaysPerYear: input.maxEncashableDaysPerYear,
        minBalanceToRetain: input.minBalanceToRetain ?? 0,
        appliesToEmploymentTypes: input.appliesToEmploymentTypes ?? [],
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(id: string, input: UpdateLeaveTypeInput) {
    await this.get(id);
    return this.prisma.leaveType.update({ where: { id }, data: input });
  }
}
