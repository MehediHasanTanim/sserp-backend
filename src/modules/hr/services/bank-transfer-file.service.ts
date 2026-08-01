import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

@Injectable()
export class BankTransferFileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds a CSV of pending slips for bank transfer (PR-15).
   * Columns: employeeCode, name, netAmount
   */
  async generate(runId: string): Promise<{
    content: string;
    checksum: string;
    objectKey: string;
  }> {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
    });
    if (!run) throw DomainException.notFound('Payroll run not found');

    const slips = await this.prisma.payrollSlip.findMany({
      where: { payrollRunId: runId, paymentStatus: 'pending' },
      include: { employee: { select: { employeeCode: true, fullName: true } } },
      orderBy: { slipNumber: 'asc' },
    });

    const lines = ['employeeCode,name,netAmount'];
    for (const slip of slips) {
      const name = slip.employee.fullName.replace(/"/g, '""');
      lines.push(`${slip.employee.employeeCode},"${name}",${slip.netAmount}`);
    }
    const content = lines.join('\n') + '\n';
    const checksum = createHash('sha256').update(content, 'utf8').digest('hex');
    const objectKey = `payroll/${runId}/bank.csv`;
    return { content, checksum, objectKey };
  }
}
