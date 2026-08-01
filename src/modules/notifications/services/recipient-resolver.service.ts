import { Injectable } from '@nestjs/common';
import { NotificationPriority, NotificationType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface ResolvedRecipient {
  userId: string;
  email?: string | null;
  phone?: string | null;
}

@Injectable()
export class RecipientResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async guardiansOfStudent(
    studentId: string,
    priority: NotificationPriority = NotificationPriority.normal,
  ): Promise<ResolvedRecipient[]> {
    const where =
      priority === NotificationPriority.critical
        ? { studentId, portalAccessEnabled: true }
        : { studentId, portalAccessEnabled: true, isPrimary: true };

    const links = await this.prisma.studentGuardian.findMany({ where });
    const profileIds = [
      ...new Set(
        links
          .map((l) => l.guardianProfileId)
          .filter((id): id is string => !!id),
      ),
    ];
    if (!profileIds.length) return [];

    const users = await this.prisma.user.findMany({
      where: {
        guardianId: { in: profileIds },
        isActive: true,
        deletedAt: null,
      },
      include: { guardianProfile: true },
    });

    return users.map((u) => ({
      userId: u.id,
      email: u.email,
      phone: u.guardianProfile?.phone ?? null,
    }));
  }

  async usersByRoles(roles: string[]): Promise<ResolvedRecipient[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        roles: { some: { role: { name: { in: roles } } } },
      },
    });
    return users.map((u) => ({
      userId: u.id,
      email: u.email,
      phone: null,
    }));
  }

  async userById(userId: string): Promise<ResolvedRecipient | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
    });
    if (!user) return null;
    return { userId: user.id, email: user.email, phone: null };
  }

  async prRequester(prId: string): Promise<ResolvedRecipient | null> {
    const pr = await this.prisma.purchaseRequest.findUnique({
      where: { id: prId },
    });
    if (!pr) return null;
    return this.userById(pr.requestedBy);
  }

  async groupSessionGuardians(groupId: string): Promise<ResolvedRecipient[]> {
    const memberships = await this.prisma.groupMembership.findMany({
      where: { groupId, state: 'active', exitDate: null },
      include: { patient: true },
    });
    const recipients: ResolvedRecipient[] = [];
    const seen = new Set<string>();
    for (const m of memberships) {
      const studentId = m.patient?.studentId;
      if (!studentId) continue;
      const guardians = await this.guardiansOfStudent(studentId);
      for (const g of guardians) {
        if (seen.has(g.userId)) continue;
        seen.add(g.userId);
        recipients.push(g);
      }
    }
    return recipients;
  }

  async typePriority(typeCode: string): Promise<NotificationPriority> {
    const type = await this.prisma.notificationType.findUnique({
      where: { code: typeCode },
    });
    return type?.priority ?? NotificationPriority.normal;
  }
}
