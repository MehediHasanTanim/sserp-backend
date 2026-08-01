import { Injectable, Logger } from '@nestjs/common';
import {
  DigestMode,
  NotificationChannel as PrismaChannel,
  NotificationPreference,
  NotificationPriority,
  NotificationType,
  OrganizationSettings,
} from '@prisma/client';
import { NotificationChannel } from '../constants';

export interface ChannelRouteContext {
  type: NotificationType;
  preference: NotificationPreference | null;
  orgSettings: OrganizationSettings;
  suppressedAddresses: Set<string>;
  userEmail?: string | null;
  userPhone?: string | null;
  now?: Date;
}

export interface ChannelRouteResult {
  channels: NotificationChannel[];
  deferredUntil?: Date;
  queueDigest: boolean;
  suppressed: Array<{ channel: NotificationChannel; address: string }>;
}

@Injectable()
export class ChannelRouterService {
  private readonly logger = new Logger(ChannelRouterService.name);

  route(ctx: ChannelRouteContext): ChannelRouteResult {
    const now = ctx.now ?? new Date();
    const isCritical = ctx.type.priority === NotificationPriority.critical;

    let channels = this.intersectChannels(
      ctx.type.defaultChannels as NotificationChannel[],
      ctx.type.allowedChannels as NotificationChannel[],
    );

    if (!isCritical) {
      channels = this.applyPreferences(channels, ctx.preference);
    }

    channels = this.applyKillSwitches(channels, ctx.orgSettings);

    const suppressed: ChannelRouteResult['suppressed'] = [];
    channels = channels.filter((ch) => {
      if (ch === 'in_app') return true;
      const addr = ch === 'email' ? ctx.userEmail : ctx.userPhone;
      if (!addr) return false;
      const key = `${ch}:${addr.toLowerCase()}`;
      if (ctx.suppressedAddresses.has(key)) {
        suppressed.push({ channel: ch, address: addr });
        return false;
      }
      return true;
    });

    let queueDigest = false;
    if (
      !isCritical &&
      ctx.type.supportsDigest &&
      ctx.preference?.digestMode &&
      ctx.preference.digestMode !== DigestMode.immediate
    ) {
      const deferrable = channels.filter((c) => c !== 'in_app');
      if (deferrable.length) {
        queueDigest = true;
        channels = channels.filter((c) => c === 'in_app');
      }
    }

    // Quiet hours: keep email/sms in the channel list and set deferredUntil so
    // the orchestrator enqueues with delay. In-app is never deferred (NT-05).
    let deferredUntil: Date | undefined;
    if (!isCritical) {
      const deferResult = this.applyQuietHours(
        channels,
        ctx.preference,
        ctx.orgSettings,
        now,
      );
      deferredUntil = deferResult.deferredUntil;
    }

    return { channels, deferredUntil, queueDigest, suppressed };
  }

  intersectChannels(
    defaults: NotificationChannel[],
    allowed: NotificationChannel[],
  ): NotificationChannel[] {
    const allowedSet = new Set(allowed);
    return defaults.filter((c) => allowedSet.has(c));
  }

  applyPreferences(
    channels: NotificationChannel[],
    pref: NotificationPreference | null,
  ): NotificationChannel[] {
    if (!pref) return channels;
    return channels.filter((ch) => {
      if (ch === 'in_app') return pref.inAppEnabled;
      if (ch === 'email') return pref.emailEnabled;
      if (ch === 'sms') return pref.smsEnabled;
      return true;
    });
  }

  applyKillSwitches(
    channels: NotificationChannel[],
    org: OrganizationSettings,
  ): NotificationChannel[] {
    return channels.filter((ch) => {
      if (ch === 'email' && !org.emailEnabled) return false;
      if (ch === 'sms' && !org.smsEnabled) return false;
      return true;
    });
  }

  applyQuietHours(
    channels: NotificationChannel[],
    pref: NotificationPreference | null,
    org: OrganizationSettings,
    now: Date,
  ): { immediate: NotificationChannel[]; deferredUntil?: Date } {
    const start =
      pref?.quietHoursStart ?? org.notificationQuietHoursDefaultStart;
    const end = pref?.quietHoursEnd ?? org.notificationQuietHoursDefaultEnd;
    if (!start || !end) return { immediate: channels };

    if (!this.isInQuietHours(now, start, end)) {
      return { immediate: channels };
    }

    const immediate = channels.filter((c) => c === 'in_app');
    const deferred = channels.filter((c) => c !== 'in_app');
    if (!deferred.length) return { immediate: channels };

    this.logger.debug(`Deferring ${deferred.join(',')} until quiet hours end`);
    return {
      immediate,
      deferredUntil: this.quietHoursEndDate(now, end),
    };
  }

  isInQuietHours(now: Date, start: string, end: string): boolean {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const mins = now.getHours() * 60 + now.getMinutes();
    const startM = sh * 60 + (sm || 0);
    const endM = eh * 60 + (em || 0);
    if (startM <= endM) return mins >= startM && mins < endM;
    return mins >= startM || mins < endM;
  }

  quietHoursEndDate(now: Date, end: string): Date {
    const [eh, em] = end.split(':').map(Number);
    const d = new Date(now);
    d.setHours(eh, em || 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }

  toPrismaChannel(ch: NotificationChannel): PrismaChannel {
    return ch as PrismaChannel;
  }
}
