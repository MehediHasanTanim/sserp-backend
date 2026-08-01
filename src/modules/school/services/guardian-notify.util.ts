import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationPort } from '../../../shared/ports/notification.port';

/**
 * Shared helper for notifying every portal-enabled guardian of a student, and
 * every user holding one of a set of staff roles. Resolves guardians via
 * `student_guardians.guardian_profile_id -> users.guardian_id`, matching the
 * schema introduced in docs/plan/backend/03-phase2-school-advanced.md §3.
 */
export async function notifyGuardiansForStudent(
  prisma: PrismaService,
  notifications: NotificationPort,
  studentId: string,
  input: { type: string; title: string; body: string },
): Promise<void> {
  const links = await prisma.studentGuardian.findMany({
    where: {
      studentId,
      portalAccessEnabled: true,
      guardianProfileId: { not: null },
    },
  });
  const guardianProfileIds = [
    ...new Set(
      links.map((l) => l.guardianProfileId).filter((id): id is string => !!id),
    ),
  ];
  if (!guardianProfileIds.length) return;

  const users = await prisma.user.findMany({
    where: {
      guardianId: { in: guardianProfileIds },
      isActive: true,
      deletedAt: null,
    },
  });
  for (const user of users) {
    await notifications.notify({
      userId: user.id,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: 'student',
      entityId: studentId,
    });
  }
}

export async function notifyStaffByRoles(
  prisma: PrismaService,
  notifications: NotificationPort,
  roles: string[],
  input: {
    type: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
  },
): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      roles: { some: { role: { name: { in: roles } } } },
    },
  });
  for (const user of users) {
    await notifications.notify({
      userId: user.id,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }
}
