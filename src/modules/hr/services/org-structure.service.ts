import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

export interface CreateDepartmentInput {
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export type UpdateDepartmentInput = Partial<
  Omit<CreateDepartmentInput, 'code'>
>;

export interface CreateDesignationInput {
  name: string;
  departmentId: string;
  code?: string;
  description?: string;
  isActive?: boolean;
}

export type UpdateDesignationInput = Partial<CreateDesignationInput>;

@Injectable()
export class OrgStructureService {
  constructor(private readonly prisma: PrismaService) {}

  async listDepartments(includeInactive = false) {
    return this.prisma.department.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { designations: true, employees: true } },
      },
    });
  }

  async getDepartment(id: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, deletedAt: null },
      include: {
        designations: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
        },
        _count: { select: { employees: true } },
      },
    });
    if (!department) throw DomainException.notFound('Department not found');
    return department;
  }

  async requireDepartment(id: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, deletedAt: null, isActive: true },
    });
    if (!department) throw DomainException.notFound('Department not found');
    return department;
  }

  async requireDepartmentByCode(code: string) {
    const department = await this.prisma.department.findFirst({
      where: { code, deletedAt: null, isActive: true },
    });
    if (!department) {
      throw DomainException.notFound(`Department code "${code}" not found`);
    }
    return department;
  }

  async createDepartment(input: CreateDepartmentInput) {
    const code = input.code.trim().toLowerCase();
    const existing = await this.prisma.department.findFirst({
      where: { code },
    });
    if (existing && !existing.deletedAt) {
      throw DomainException.conflict(`Department code "${code}" already exists`);
    }
    if (existing?.deletedAt) {
      return this.prisma.department.update({
        where: { id: existing.id },
        data: {
          name: input.name.trim(),
          description: input.description,
          isActive: input.isActive ?? true,
          sortOrder: input.sortOrder ?? 0,
          deletedAt: null,
        },
      });
    }
    return this.prisma.department.create({
      data: {
        code,
        name: input.name.trim(),
        description: input.description,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async updateDepartment(id: string, input: UpdateDepartmentInput) {
    await this.getDepartment(id);
    return this.prisma.department.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
  }

  async deleteDepartment(id: string) {
    await this.getDepartment(id);
    const employeeCount = await this.prisma.employee.count({
      where: { departmentId: id, deletedAt: null },
    });
    if (employeeCount > 0) {
      throw DomainException.conflict(
        'Cannot delete department while employees are assigned',
      );
    }
    await this.prisma.designation.updateMany({
      where: { departmentId: id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    return this.prisma.department.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async listDesignations(query: {
    departmentId?: string;
    includeInactive?: boolean;
  }) {
    return this.prisma.designation.findMany({
      where: {
        deletedAt: null,
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      },
      include: {
        department: { select: { id: true, code: true, name: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getDesignation(id: string) {
    const designation = await this.prisma.designation.findFirst({
      where: { id, deletedAt: null },
      include: {
        department: { select: { id: true, code: true, name: true } },
        _count: { select: { employees: true } },
      },
    });
    if (!designation) throw DomainException.notFound('Designation not found');
    return designation;
  }

  async requireDesignation(id: string, departmentId?: string) {
    const designation = await this.prisma.designation.findFirst({
      where: { id, deletedAt: null, isActive: true },
    });
    if (!designation) throw DomainException.notFound('Designation not found');
    if (departmentId && designation.departmentId !== departmentId) {
      throw DomainException.validation(
        'Designation does not belong to the selected department',
      );
    }
    return designation;
  }

  async createDesignation(input: CreateDesignationInput) {
    await this.requireDepartment(input.departmentId);
    const name = input.name.trim();
    const existing = await this.prisma.designation.findFirst({
      where: { departmentId: input.departmentId, name },
    });
    if (existing && !existing.deletedAt) {
      throw DomainException.conflict(
        `Designation "${name}" already exists in this department`,
      );
    }
    if (existing?.deletedAt) {
      return this.prisma.designation.update({
        where: { id: existing.id },
        data: {
          code: input.code,
          description: input.description,
          isActive: input.isActive ?? true,
          deletedAt: null,
        },
      });
    }
    try {
      return await this.prisma.designation.create({
        data: {
          name,
          departmentId: input.departmentId,
          code: input.code,
          description: input.description,
          isActive: input.isActive ?? true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw DomainException.conflict(
          `Designation "${name}" already exists in this department`,
        );
      }
      throw err;
    }
  }

  async updateDesignation(id: string, input: UpdateDesignationInput) {
    await this.getDesignation(id);
    if (input.departmentId) await this.requireDepartment(input.departmentId);
    try {
      return await this.prisma.designation.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.departmentId !== undefined
            ? { departmentId: input.departmentId }
            : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw DomainException.conflict(
          'Designation name already exists in this department',
        );
      }
      throw err;
    }
  }

  async deleteDesignation(id: string) {
    await this.getDesignation(id);
    const employeeCount = await this.prisma.employee.count({
      where: { designationId: id, deletedAt: null },
    });
    if (employeeCount > 0) {
      throw DomainException.conflict(
        'Cannot delete designation while employees are assigned',
      );
    }
    return this.prisma.designation.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  /** Resolve or create designation by name under a department code (seed/recruitment). */
  async resolveIdsByCodeAndName(departmentCode: string, designationName: string) {
    const department = await this.requireDepartmentByCode(departmentCode);
    const name = designationName.trim();
    const designation = await this.prisma.designation.upsert({
      where: {
        departmentId_name: { departmentId: department.id, name },
      },
      create: {
        name,
        departmentId: department.id,
        isActive: true,
      },
      update: { deletedAt: null, isActive: true },
    });
    return { departmentId: department.id, designationId: designation.id };
  }
}
