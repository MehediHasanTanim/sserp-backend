import { RecipientResolverService } from './recipient-resolver.service';
import { NotificationPriority } from '@prisma/client';

describe('RecipientResolverService', () => {
  const prisma = {
    studentGuardian: { findMany: jest.fn() },
    user: { findMany: jest.fn(), findFirst: jest.fn() },
    purchaseRequest: { findUnique: jest.fn() },
    groupMembership: { findMany: jest.fn() },
    notificationType: { findUnique: jest.fn() },
  };
  const service = new RecipientResolverService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('student absence uses guardians not teachers', async () => {
    prisma.studentGuardian.findMany.mockResolvedValue([
      { guardianProfileId: 'g1', isPrimary: true },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', email: 'g@test.com' }]);
    const r = await service.guardiansOfStudent(
      's1',
      NotificationPriority.critical,
    );
    expect(r.map((x) => x.userId)).toEqual(['u1']);
    expect(prisma.studentGuardian.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: 's1' }),
      }),
    );
  });

  it('primary-only for normal priority', async () => {
    prisma.studentGuardian.findMany.mockResolvedValue([]);
    await service.guardiansOfStudent('s1', NotificationPriority.normal);
    expect(prisma.studentGuardian.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPrimary: true }),
      }),
    );
  });

  it('PR status resolves requester only', async () => {
    prisma.purchaseRequest.findUnique.mockResolvedValue({
      requestedBy: 'req1',
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'req1',
      email: 'r@test.com',
      isActive: true,
    });
    const r = await service.prRequester('pr1');
    expect(r?.userId).toBe('req1');
  });

  it('low stock role resolution uses procurement_officer', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'po1', email: 'po@test.com' },
    ]);
    const r = await service.usersByRoles(['procurement_officer']);
    expect(r).toHaveLength(1);
  });
});
