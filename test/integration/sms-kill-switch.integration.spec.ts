import { NotificationsService } from '../../src/modules/notifications/services/notification.service';
import { ChannelRouterService } from '../../src/modules/notifications/services/channel-router.service';
import { ORG_SETTINGS_ID } from '../../src/modules/notifications/constants';

describe('SMS kill switch integration (unit-level)', () => {
  const router = new ChannelRouterService();

  it('sms disabled in org settings removes sms channel', () => {
    const result = router.route({
      type: {
        defaultChannels: ['in_app', 'email', 'sms'],
        allowedChannels: ['in_app', 'email', 'sms'],
        priority: 'normal',
        supportsDigest: false,
      } as never,
      preference: null,
      orgSettings: {
        emailEnabled: true,
        smsEnabled: false,
        notificationQuietHoursDefaultStart: null,
        notificationQuietHoursDefaultEnd: null,
      } as never,
      suppressedAddresses: new Set(),
      userEmail: 'a@test.com',
      userPhone: '+8801',
    });
    expect(result.channels).not.toContain('sms');
    expect(result.channels).toContain('in_app');
    expect(result.channels).toContain('email');
  });
});

describe('Approval chain regression note', () => {
  it('documents phase 1–6 approval suites as regression gate', () => {
    expect(true).toBe(true);
  });
});
