/**
 * Mapping completeness — every notifiable event has a mapping; type codes exist in seed.
 */
import {
  NOTIFIABLE_EVENTS,
  NOTIFICATION_MAP,
  assertNotificationMappingComplete,
} from '../../src/modules/notifications/listeners/notification-map';
import { NOTIFICATION_TYPES } from '../../prisma/seed/phase8.seed';

describe('Notification mapping completeness', () => {
  it('maps every notifiable event and type code exists in seed', () => {
    const typeCodes = new Set(NOTIFICATION_TYPES.map((t) => t.code));
    expect(() => assertNotificationMappingComplete(typeCodes)).not.toThrow();
    expect(NOTIFICATION_MAP.length).toBeGreaterThanOrEqual(
      NOTIFIABLE_EVENTS.length,
    );
    for (const event of NOTIFIABLE_EVENTS) {
      expect(NOTIFICATION_MAP.some((m) => m.event === event)).toBe(true);
    }
  });
});
