import { Injectable } from '@nestjs/common';
import {
  EmployeeStatus,
  EmploymentType,
  HrDepartment,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import { NumberingService } from '../../admin/services/organization.service';

export interface CreateEmployeeInput {
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  nationalId?: string;
  personalEmail?: string;
  phone?: string;
  address?: Record<string, unknown>;
  photoAttachmentId?: string;
  department: HrDepartment;
  designation: string;
  employmentType: EmploymentType;
  reportingManagerId?: string;
  joiningDate: string;
  probationEndDate?: string;
  basicSalary: number;
}

export interface UpdateEmployeeInput {
  fullName?: string;
  dateOfBirth?: string;
  gender?: string;
  nationalId?: string;
  personalEmail?: string;
  phone?: string;
  address?: Record<string, unknown>;
  photoAttachmentId?: string;
  department?: HrDepartment;
  designation?: string;
  employmentType?: EmploymentType;
  reportingManagerId?: string;
  probationEndDate?: string;
  basicSalary?: number;
  status?: EmployeeStatus;
}

export interface EmployeeListQuery {
  page?: number;
  pageSize?: number;
  department?: HrDepartment;
  employmentType?: EmploymentType;
  status?: EmployeeStatus;
  reportingManagerId?: string;
  search?: string;
}

const TRACKED_FIELDS = [
  'department',
  'designation',
  'basicSalary',
  'status',
  'reportingManagerId',
] as const;

function changeTypeFor(field: (typeof TRACKED_FIELDS)[number]) {
  switch (field) {
    case 'department':
    case 'reportingManagerId':
      return 'transfer' as const;
    case 'designation':
      return 'designation_change' as const;
    case 'basicSalary':
      return 'salary_change' as const;
    case 'status':
      return 'status_change' as const;
  }
}

@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  async list(query: EmployeeListQuery) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.EmployeeWhereInput = { deletedAt: null };
    if (query.department) where.department = query.department;
    if (query.employmentType) where.employmentType = query.employmentType;
    if (query.status) where.status = query.status;
    if (query.reportingManagerId)
      where.reportingManagerId = query.reportingManagerId;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { employeeCode: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { items, page, pageSize, total };
  }

  async get(id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
      include: {
        reportingManager: {
          select: { id: true, employeeCode: true, fullName: true },
        },
        contracts: { orderBy: { startDate: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        exit: true,
        shiftAssignments: {
          where: { effectiveTo: null },
          include: { hrShift: true },
        },
      },
    });
    if (!employee) throw DomainException.notFound('Employee not found');
    return employee;
  }

  private async requireActive(
    id: string,
    client: TxClient | PrismaService = this.prisma,
  ) {
    const employee = await client.employee.findFirst({
      where: { id, deletedAt: null },
    });
    if (!employee) throw DomainException.notFound('Employee not found');
    return employee;
  }

  async create(input: CreateEmployeeInput, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const employeeCode = await this.numbering.nextCode('employee', tx);
      return tx.employee.create({
        data: {
          employeeCode,
          fullName: input.fullName,
          dateOfBirth: input.dateOfBirth
            ? new Date(input.dateOfBirth)
            : undefined,
          gender: input.gender,
          nationalId: input.nationalId,
          personalEmail: input.personalEmail,
          phone: input.phone,
          address: input.address as Prisma.InputJsonValue | undefined,
          photoAttachmentId: input.photoAttachmentId,
          department: input.department,
          designation: input.designation,
          employmentType: input.employmentType,
          reportingManagerId: input.reportingManagerId,
          joiningDate: new Date(input.joiningDate),
          probationEndDate: input.probationEndDate
            ? new Date(input.probationEndDate)
            : undefined,
          basicSalary: input.basicSalary,
          createdBy: actorId,
        },
      });
    });
  }

  async update(id: string, input: UpdateEmployeeInput, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.requireActive(id, tx);

      const data: Prisma.EmployeeUpdateInput = {
        fullName: input.fullName,
        dateOfBirth: input.dateOfBirth
          ? new Date(input.dateOfBirth)
          : undefined,
        gender: input.gender,
        nationalId: input.nationalId,
        personalEmail: input.personalEmail,
        phone: input.phone,
        address: input.address as Prisma.InputJsonValue | undefined,
        photoAttachmentId: input.photoAttachmentId,
        designation: input.designation,
        employmentType: input.employmentType,
        probationEndDate: input.probationEndDate
          ? new Date(input.probationEndDate)
          : undefined,
        basicSalary: input.basicSalary,
        status: input.status,
        updatedBy: actorId,
      };
      if (input.department) data.department = input.department;
      if (input.reportingManagerId !== undefined) {
        data.reportingManager = input.reportingManagerId
          ? { connect: { id: input.reportingManagerId } }
          : { disconnect: true };
      }

      const updated = await tx.employee.update({ where: { id }, data });

      const historyRows: Prisma.EmployeeHistoryCreateManyInput[] = [];
      for (const field of TRACKED_FIELDS) {
        const before = (existing as Record<string, unknown>)[field];
        const after = (updated as Record<string, unknown>)[field];
        const changed =
          field === 'basicSalary'
            ? Number(before) !== Number(after)
            : before !== after;
        if (input[field as keyof UpdateEmployeeInput] === undefined || !changed)
          continue;
        historyRows.push({
          employeeId: id,
          changeType: changeTypeFor(field),
          effectiveDate: new Date(),
          fromValue: { [field]: before } as Prisma.InputJsonValue,
          toValue: { [field]: after } as Prisma.InputJsonValue,
          recordedBy: actorId,
        });
      }
      if (historyRows.length) {
        await tx.employeeHistory.createMany({ data: historyRows });
      }

      return updated;
    });
  }

  async softDelete(id: string, actorId: string) {
    await this.requireActive(id);
    return this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorId },
    });
  }
}
