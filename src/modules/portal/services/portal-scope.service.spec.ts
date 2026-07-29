import { DomainException, ErrorCode } from '../../../shared/errors/domain-exception';
import { PortalScopeService } from './portal-scope.service';

describe('PortalScopeService', () => {
  const prisma = {
    studentGuardian: { findMany: jest.fn() },
    user: { findFirst: jest.fn() },
  };
  const service = new PortalScopeService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('resolves multiple children and excludes pending fee', async () => {
    prisma.studentGuardian.findMany.mockResolvedValue([
      { studentId: 's1' },
      { studentId: 's2' },
      { studentId: 's1' },
    ]);
    const scope = await service.resolveForGuardianProfile('g1');
    expect(scope.studentIds.sort()).toEqual(['s1', 's2']);
    expect(scope.guardianProfileId).toBe('g1');
  });

  it('assertStudentAccess throws for out-of-scope student', () => {
    expect(() =>
      service.assertStudentAccess(
        { guardianProfileId: 'g1', studentIds: ['s1'] },
        's3',
      ),
    ).toThrow(DomainException);
    try {
      service.assertStudentAccess(
        { guardianProfileId: 'g1', studentIds: ['s1'] },
        's3',
      );
    } catch (e) {
      expect((e as DomainException).code).toBe(ErrorCode.FORBIDDEN);
    }
  });
});
