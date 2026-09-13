import { Injectable } from '@nestjs/common';
import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

/**
 * The only shape of employee data any module outside `hr` may see.
 * NEVER add `basicSalary` or any other compensation/PII field here.
 */
export interface HrEmployeeSummary {
  id: string;
  employeeCode: string;
  fullName: string;
  phone: string | null;
  designation: string;
  department: string;
  departmentId: string;
  designationId: string;
  status: EmployeeStatus;
}

const SUMMARY_SELECT = {
  id: true,
  employeeCode: true,
  fullName: true,
  phone: true,
  departmentId: true,
  designationId: true,
  status: true,
  department: { select: { code: true } },
  designation: { select: { name: true } },
} as const;

function toSummary(row: {
  id: string;
  employeeCode: string;
  fullName: string;
  phone: string | null;
  departmentId: string;
  designationId: string;
  status: EmployeeStatus;
  department: { code: string };
  designation: { name: string };
}): HrEmployeeSummary {
  return {
    id: row.id,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    phone: row.phone,
    designation: row.designation.name,
    department: row.department.code,
    departmentId: row.departmentId,
    designationId: row.designationId,
    status: row.status,
  };
}

/**
 * Public read façade consumed by School/Therapy. This is the only
 * permitted path from those modules to `employees` data — see
 * docs/plan/backend/02-phase1-hr-school-core.md §4 boundary rule.
 */
@Injectable()
export class HrEmployeeReadService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<HrEmployeeSummary> {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
      select: SUMMARY_SELECT,
    });
    if (!employee) throw DomainException.notFound('Employee not found');
    return toSummary(employee);
  }

  async findByIds(ids: string[]): Promise<HrEmployeeSummary[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.employee.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: SUMMARY_SELECT,
    });
    return rows.map(toSummary);
  }

  async listActive(department?: string): Promise<HrEmployeeSummary[]> {
    const rows = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        status: 'active',
        ...(department ? { department: { code: department } } : {}),
      },
      select: SUMMARY_SELECT,
      orderBy: { fullName: 'asc' },
    });
    return rows.map(toSummary);
  }
}
