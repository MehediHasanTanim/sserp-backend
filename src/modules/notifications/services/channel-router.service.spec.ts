import { ChannelRouterService } from './channel-router.service';
import {
  DigestMode,
  NotificationPriority,
  OrganizationSettings,
} from '@prisma/client';

const baseOrg = {
  emailEnabled: true,
  smsEnabled: true,
  notificationQuietHoursDefaultStart: null,
  notificationQuietHoursDefaultEnd: null,
} as OrganizationSettings;

const baseType = {
  defaultChannels: ['in_app', 'email', 'sms'],
  allowedChannels: ['in_app', 'email', 'sms'],
  priority: NotificationPriority.normal,
  supportsDigest: true,
};

describe('ChannelRouterService', () => {
  const router = new ChannelRouterService();

  it('returns default intersect channels', () => {
    const result = router.route({
      type: baseType as never,
      preference: null,
      orgSettings: baseOrg,
      suppressedAddresses: new Set(),
      userEmail: 'user@test.com',
      userPhone: '+8801700000000',
    });
    expect(result.channels.sort()).toEqual(['email', 'in_app', 'sms']);
  });

  it('respects email preference off', () => {
    const result = router.route({
      type: baseType as never,
      preference: {
        inAppEnabled: true,
        emailEnabled: false,
        smsEnabled: true,
        digestMode: DigestMode.immediate,
      } as never,
      orgSettings: baseOrg,
      suppressedAddresses: new Set(),
      userEmail: 'user@test.com',
      userPhone: '+8801',
    });
    expect(result.channels).toEqual(expect.arrayContaining(['in_app', 'sms']));
    expect(result.channels).not.toContain('email');
  });

  it('sms kill switch', () => {
    const result = router.route({
      type: baseType as never,
      preference: null,
      orgSettings: { ...baseOrg, smsEnabled: false } as OrganizationSettings,
      suppressedAddresses: new Set(),
      userEmail: 'user@test.com',
      userPhone: '+8801',
    });
    expect(result.channels).not.toContain('sms');
  });

  it('critical ignores preferences', () => {
    const result = router.route({
      type: { ...baseType, priority: NotificationPriority.critical } as never,
      preference: {
        inAppEnabled: false,
        emailEnabled: false,
        smsEnabled: false,
        digestMode: DigestMode.daily,
      } as never,
      orgSettings: baseOrg,
      suppressedAddresses: new Set(),
      userEmail: 'user@test.com',
      userPhone: '+8801',
    });
    expect(result.channels.sort()).toEqual(['email', 'in_app', 'sms']);
    expect(result.queueDigest).toBe(false);
  });

  it('digest queues deferrable channels', () => {
    const result = router.route({
      type: baseType as never,
      preference: {
        inAppEnabled: true,
        emailEnabled: true,
        smsEnabled: true,
        digestMode: DigestMode.daily,
      } as never,
      orgSettings: baseOrg,
      suppressedAddresses: new Set(),
      userEmail: 'user@test.com',
      userPhone: '+8801',
    });
    expect(result.queueDigest).toBe(true);
    expect(result.channels).toEqual(['in_app']);
  });

  it('suppressed email recorded', () => {
    const result = router.route({
      type: baseType as never,
      preference: null,
      orgSettings: baseOrg,
      suppressedAddresses: new Set(['email:user@test.com']),
      userEmail: 'user@test.com',
      userPhone: '+8801',
    });
    expect(result.suppressed).toHaveLength(1);
    expect(result.channels).not.toContain('email');
  });

  it('quiet hours defer email/sms', () => {
    const result = router.route({
      type: baseType as never,
      preference: {
        inAppEnabled: true,
        emailEnabled: true,
        smsEnabled: true,
        quietHoursStart: '00:00',
        quietHoursEnd: '23:59',
        digestMode: DigestMode.immediate,
      } as never,
      orgSettings: baseOrg,
      suppressedAddresses: new Set(),
      userEmail: 'user@test.com',
      userPhone: '+8801',
      now: new Date('2026-08-01T12:00:00Z'),
    });
    expect(result.channels.sort()).toEqual(['email', 'in_app', 'sms']);
    expect(result.deferredUntil).toBeDefined();
  });

  it('critical ignores quiet hours', () => {
    const result = router.route({
      type: { ...baseType, priority: NotificationPriority.critical } as never,
      preference: {
        inAppEnabled: true,
        emailEnabled: true,
        smsEnabled: true,
        quietHoursStart: '00:00',
        quietHoursEnd: '23:59',
        digestMode: DigestMode.immediate,
      } as never,
      orgSettings: baseOrg,
      suppressedAddresses: new Set(),
      userEmail: 'user@test.com',
      userPhone: '+8801',
      now: new Date('2026-08-01T12:00:00Z'),
    });
    expect(result.deferredUntil).toBeUndefined();
    expect(result.channels.sort()).toEqual(['email', 'in_app', 'sms']);
  });

  it('intersect trims disallowed channels', () => {
    const result = router.intersectChannels(
      ['in_app', 'sms'],
      ['in_app', 'email'],
    );
    expect(result).toEqual(['in_app']);
  });

  it('applyKillSwitches removes email', () => {
    const channels = router.applyKillSwitches(['in_app', 'email'], {
      ...baseOrg,
      emailEnabled: false,
    } as OrganizationSettings);
    expect(channels).toEqual(['in_app']);
  });

  it('applyPreferences filters sms', () => {
    const channels = router.applyPreferences(['in_app', 'sms'], {
      inAppEnabled: true,
      emailEnabled: true,
      smsEnabled: false,
    } as never);
    expect(channels).toEqual(['in_app']);
  });

  it('no phone skips sms', () => {
    const result = router.route({
      type: baseType as never,
      preference: null,
      orgSettings: baseOrg,
      suppressedAddresses: new Set(),
      userEmail: 'user@test.com',
      userPhone: null,
    });
    expect(result.channels).not.toContain('sms');
  });

  it('supports_digest false sends immediately despite digest pref', () => {
    const result = router.route({
      type: { ...baseType, supportsDigest: false } as never,
      preference: {
        inAppEnabled: true,
        emailEnabled: true,
        smsEnabled: true,
        digestMode: DigestMode.daily,
      } as never,
      orgSettings: baseOrg,
      suppressedAddresses: new Set(),
      userEmail: 'user@test.com',
      userPhone: '+8801',
    });
    expect(result.queueDigest).toBe(false);
  });
});
