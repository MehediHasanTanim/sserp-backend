import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';

export interface PortalScope {
  studentIds: string[];
  guardianProfileId: string;
}

@Injectable()
export class PortalScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForGuardianProfile(
    guardianProfileId: string,
  ): Promise<PortalScope> {
    const links = await this.prisma.studentGuardian.findMany({
      where: {
        guardianProfileId,
        portalAccessEnabled: true,
        student: {
          deletedAt: null,
          status: { not: 'pending_admission_fee' },
        },
      },
      select: { studentId: true },
    });
    return {
      guardianProfileId,
      studentIds: [...new Set(links.map((l) => l.studentId))],
    };
  }

  async resolveForUser(userId: string): Promise<PortalScope | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { guardianId: true },
    });
    if (!user?.guardianId) return null;
    return this.resolveForGuardianProfile(user.guardianId);
  }

  assertStudentAccess(scope: PortalScope | undefined, studentId: string) {
    if (!scope?.studentIds.includes(studentId)) {
      throw DomainException.withCode(
        ErrorCode.FORBIDDEN,
        403,
        'Student not in portal scope',
      );
    }
  }
}
