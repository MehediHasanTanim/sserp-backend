import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { CurrentUser, AuthUser, Roles } from '../../../shared/decorators';
import { NotificationsService } from '../services/notification.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';

class UpdatePreferencesDto {
  @IsArray()
  preferences!: Array<{
    notificationTypeCode: string;
    inAppEnabled?: boolean;
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    digestMode?: 'immediate' | 'daily' | 'weekly';
    quietHoursStart?: string;
    quietHoursEnd?: string;
  }>;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('unread') unread?: string,
    @Query('type') type?: string,
    @Query('priority') priority?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.notifications.list(user.id, {
      unreadOnly: unread === 'true',
      type,
      priority,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Get('preferences')
  async getPreferences(@CurrentUser() user: AuthUser) {
    const [types, prefs] = await Promise.all([
      this.prisma.notificationType.findMany({ where: { isActive: true } }),
      this.prisma.notificationPreference.findMany({
        where: { userId: user.id },
      }),
    ]);
    const prefMap = new Map(prefs.map((p) => [p.notificationTypeCode, p]));
    return types.map((t) => ({
      type: t,
      preference: prefMap.get(t.code) ?? null,
    }));
  }

  @Put('preferences')
  async updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdatePreferencesDto,
  ) {
    for (const pref of body.preferences) {
      await this.prisma.notificationPreference.upsert({
        where: {
          userId_notificationTypeCode: {
            userId: user.id,
            notificationTypeCode: pref.notificationTypeCode,
          },
        },
        create: {
          userId: user.id,
          notificationTypeCode: pref.notificationTypeCode,
          inAppEnabled: pref.inAppEnabled ?? true,
          emailEnabled: pref.emailEnabled ?? true,
          smsEnabled: pref.smsEnabled ?? true,
          digestMode: pref.digestMode ?? 'immediate',
          quietHoursStart: pref.quietHoursStart,
          quietHoursEnd: pref.quietHoursEnd,
        },
        update: {
          inAppEnabled: pref.inAppEnabled,
          emailEnabled: pref.emailEnabled,
          smsEnabled: pref.smsEnabled,
          digestMode: pref.digestMode,
          quietHoursStart: pref.quietHoursStart,
          quietHoursEnd: pref.quietHoursEnd,
        },
      });
    }
    return { ok: true };
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  markAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.archive(user.id, id);
  }
}
