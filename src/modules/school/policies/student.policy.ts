import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuthUser } from '../../../shared/decorators';
import { DomainException } from '../../../shared/errors/domain-exception';

const UNSCOPED_ROLES = [
  'super_admin',
  'principal',
  'coordinator',
  'receptionist',
  'accountant',
];

/**
 * S-02: while a student is `pending_admission_fee`, no timetable scheduling
 * or portal access; and a teacher may only ever see their own mapped
 * students (docs/plan/backend/02-phase1-hr-school-core.md §4).
 */
@Injectable()
export class StudentPolicy {
  constructor(private readonly prisma: PrismaService) {}

  isUnscoped(user: AuthUser): boolean {
    return user.roles.some((r) => UNSCOPED_ROLES.includes(r));
  }

  /** Resolves the set of student ids a `teacher` role user may view, or `null` if unscoped. */
  async scopedStudentIds(user: AuthUser): Promise<string[] | null> {
    if (this.isUnscoped(user)) return null;
    if (!user.roles.includes('teacher')) return [];

    const linkedUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true },
    });
    if (!linkedUser?.employeeId) return [];

    const mappings = await this.prisma.studentTeacherMapping.findMany({
      where: { teacherEmployeeId: linkedUser.employeeId, isActive: true },
      select: { studentId: true },
    });
    return mappings.map((m) => m.studentId);
  }

  async assertCanView(user: AuthUser, studentId: string) {
    const scoped = await this.scopedStudentIds(user);
    if (scoped === null) return;
    if (!scoped.includes(studentId)) {
      throw DomainException.forbidden(
        'Teachers may only view their own mapped students',
      );
    }
  }
}
