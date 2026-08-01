import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

@Injectable()
export class TaxCertificateService {
  constructor(private readonly prisma: PrismaService) {}

  async get(employeeId: string, fiscalYear: string) {
    const cert = await this.prisma.taxCertificate.findUnique({
      where: { employeeId_fiscalYear: { employeeId, fiscalYear } },
    });
    if (!cert) throw DomainException.notFound('Tax certificate not found');
    return cert;
  }

  /**
   * Aggregates locked payroll slips for the fiscal year (Jul–Jun by convention:
   * fiscalYear "2025-2026" → Jul 2025 … Jun 2026).
   */
  async issue(employeeId: string, fiscalYear: string, actorId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });
    if (!employee) throw DomainException.notFound('Employee not found');

    const { startYear, endYear } = this.parseFiscalYear(fiscalYear);
    const slips = await this.prisma.payrollSlip.findMany({
      where: {
        employeeId,
        payrollRun: {
          status: { in: ['locked', 'paid'] },
          OR: [
            { periodYear: startYear, periodMonth: { gte: 7 } },
            { periodYear: endYear, periodMonth: { lte: 6 } },
          ],
        },
      },
      include: { lines: true },
    });

    let totalGross = 0;
    let totalTaxable = 0;
    let totalTaxDeducted = 0;
    for (const slip of slips) {
      totalGross += slip.grossAmount;
      for (const line of slip.lines) {
        if (line.componentType === 'earning') {
          totalTaxable += line.amount;
        }
        if (
          line.componentType === 'deduction' &&
          /tax|tds|income.?tax/i.test(line.componentName)
        ) {
          totalTaxDeducted += line.amount;
        }
      }
    }

    return this.prisma.taxCertificate.upsert({
      where: { employeeId_fiscalYear: { employeeId, fiscalYear } },
      create: {
        employeeId,
        fiscalYear,
        totalGross,
        totalTaxable,
        totalTaxDeducted,
        issuedAt: new Date(),
        issuedBy: actorId,
      },
      update: {
        totalGross,
        totalTaxable,
        totalTaxDeducted,
        issuedAt: new Date(),
        issuedBy: actorId,
      },
    });
  }

  private parseFiscalYear(fiscalYear: string): {
    startYear: number;
    endYear: number;
  } {
    const m = /^(\d{4})-(\d{4})$/.exec(fiscalYear);
    if (!m) {
      throw DomainException.validation(
        'fiscalYear must be YYYY-YYYY (e.g. 2025-2026)',
      );
    }
    return { startYear: Number(m[1]), endYear: Number(m[2]) };
  }
}
