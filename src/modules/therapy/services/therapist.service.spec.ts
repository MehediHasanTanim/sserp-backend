import { TherapistService } from './therapist.service';

describe('TherapistService', () => {
  let service: TherapistService;
  let prisma: any;
  let hrRead: any;
  let events: any;

  beforeEach(() => {
    prisma = {
      therapist: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      therapistSpecialization: {
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      therapistLicense: { create: jest.fn() },
      therapistAvailability: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    hrRead = { findById: jest.fn() };
    events = { emit: jest.fn() };
    service = new TherapistService(prisma, hrRead, events);
  });

  describe('create', () => {
    it('T-01: should create a therapist for an active employee', async () => {
      hrRead.findById.mockResolvedValue({
        id: 'emp1',
        fullName: 'John',
        status: 'active',
      });
      prisma.therapist.findFirst.mockResolvedValue(null);
      prisma.therapist.create.mockResolvedValue({
        id: 'th1',
        employeeId: 'emp1',
      });

      const result = await service.create({ employeeId: 'emp1' }, 'user1');
      expect(result.id).toBe('th1');
      expect(events.emit).toHaveBeenCalledWith(
        'therapist.created',
        expect.any(Object),
      );
    });

    it('T-02: should reject creating therapist for inactive employee', async () => {
      hrRead.findById.mockResolvedValue({
        id: 'emp1',
        fullName: 'John',
        status: 'resigned',
      });

      await expect(
        service.create({ employeeId: 'emp1' }, 'user1'),
      ).rejects.toThrow('not active');
    });

    it('T-03: should reject duplicate therapist profile', async () => {
      hrRead.findById.mockResolvedValue({
        id: 'emp1',
        fullName: 'John',
        status: 'active',
      });
      prisma.therapist.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({ employeeId: 'emp1' }, 'user1'),
      ).rejects.toThrow('already exists');
    });
  });

  describe('addSpecialization', () => {
    it('T-04: should derive supportsGroup=true for ot', async () => {
      prisma.therapist.findFirst.mockResolvedValue({
        id: 'th1',
        deletedAt: null,
      });
      prisma.therapistSpecialization.create.mockResolvedValue({
        id: 'spec1',
        supportsGroup: true,
      });

      const result = await service.addSpecialization({
        therapistId: 'th1',
        therapyType: 'ot',
      });
      expect(prisma.therapistSpecialization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ supportsGroup: true }),
        }),
      );
    });

    it('T-05: should derive supportsGroup=false for aba', async () => {
      prisma.therapist.findFirst.mockResolvedValue({
        id: 'th1',
        deletedAt: null,
      });
      prisma.therapistSpecialization.create.mockResolvedValue({
        id: 'spec2',
        supportsGroup: false,
      });

      await service.addSpecialization({
        therapistId: 'th1',
        therapyType: 'aba',
      });
      expect(prisma.therapistSpecialization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ supportsGroup: false }),
        }),
      );
    });
  });
});
