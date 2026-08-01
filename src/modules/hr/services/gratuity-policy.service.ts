import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

@Injectable()
export class GratuityPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.gratuityPolicy.findMany({
      orderBy: [{ isActive: 'desc' }, { effectiveFrom: 'desc' }],
    });
  }

  async get(id: string) {
    const policy = await this.prisma.gratuityPolicy.findUnique({
      where: { id },
    });
    if (!policy) throw DomainException.notFound('Gratuity policy not found');
    return policy;
  }

  create(data: {
    name: string;
    minServiceYears: number;
    applicableEmploymentTypes: string[];
    daysPerYearOfService: number;
    salaryBasis: 'basic' | 'basic_plus_allowances' | 'gross';
    prorationMethod: 'monthly' | 'daily' | 'none';
    maxYearsCounted?: number;
    forfeitureOnTermination?: boolean;
    forfeitureReasons?: string[];
    effectiveFrom: string;
  }) {
    return this.prisma.gratuityPolicy.create({
      data: {
        name: data.name,
        minServiceYears: data.minServiceYears,
        applicableEmploymentTypes: data.applicableEmploymentTypes,
        daysPerYearOfService: data.daysPerYearOfService,
        salaryBasis: data.salaryBasis,
        prorationMethod: data.prorationMethod,
        maxYearsCounted: data.maxYearsCounted,
        forfeitureOnTermination: data.forfeitureOnTermination ?? false,
        forfeitureReasons: data.forfeitureReasons ?? [],
        effectiveFrom: new Date(data.effectiveFrom),
        isActive: false,
      },
    });
  }

  async update(id: string, data: Prisma.GratuityPolicyUpdateInput) {
    await this.get(id);
    return this.prisma.gratuityPolicy.update({ where: { id }, data });
  }

  /** Activates policy and deactivates the previous active one (GR-01). */
  async activate(id: string, effectiveToPrior?: string) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.gratuityPolicy.findFirst({
        where: { isActive: true, id: { not: id } },
      });
      if (prior) {
        const end =
          effectiveToPrior != null
            ? new Date(effectiveToPrior)
            : new Date(Date.now() - 24 * 60 * 60 * 1000);
        await tx.gratuityPolicy.update({
          where: { id: prior.id },
          data: { isActive: false, effectiveTo: end },
        });
      }
      return tx.gratuityPolicy.update({
        where: { id },
        data: { isActive: true, effectiveTo: null },
      });
    });
  }
}
