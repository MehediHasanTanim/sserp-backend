import { DigestService } from '../../src/modules/notifications/services/digest.service';
import { DigestMode } from '@prisma/client';

describe('Digest integration (unit-level)', () => {
  const prisma = { digestQueue: { create: jest.fn() } };
  const service = new DigestService(prisma as never);

  it('schedules daily digest for next 08:00', () => {
    const t = service.nextDigestTime(
      DigestMode.daily,
      new Date('2026-08-01T09:00:00'),
    );
    expect(t.getHours()).toBe(8);
    expect(t.getDate()).toBeGreaterThanOrEqual(2);
  });
});
