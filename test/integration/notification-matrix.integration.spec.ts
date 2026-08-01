/**
 * NT-16 — TDD 10.3 ∪ feature 11.2 channel matrix must match phase8 seed.
 */
import { TDD_103_MATRIX } from './helpers/notifications.helper';
import { NOTIFICATION_TYPES } from '../../prisma/seed/phase8.seed';

describe('Notification matrix (TDD 10.3 / NT-16)', () => {
  it('seed has exactly 25 notification types', () => {
    expect(NOTIFICATION_TYPES).toHaveLength(25);
    expect(TDD_103_MATRIX).toHaveLength(25);
  });

  it('seeded notification_types match TDD channel matrix exactly', () => {
    for (const row of TDD_103_MATRIX) {
      const seeded = NOTIFICATION_TYPES.find((t) => t.code === row.code);
      expect(seeded).toBeTruthy();
      expect([...seeded!.defaultChannels].sort()).toEqual(
        [...row.defaultChannels].sort(),
      );
    }
  });

  it('critical types are student.absent and therapy_session.cancelled', () => {
    const critical = NOTIFICATION_TYPES.filter(
      (t) => t.priority === 'critical',
    );
    expect(critical.map((t) => t.code).sort()).toEqual(
      ['student.absent', 'therapy_session.cancelled'].sort(),
    );
  });
});
