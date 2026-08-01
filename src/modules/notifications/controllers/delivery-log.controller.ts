import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DeliveryStatus, NotificationChannel } from '@prisma/client';
import { Roles } from '../../../shared/decorators';
import { DeliveryLogService } from '../services/delivery-log.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@ApiTags('admin-delivery-log')
@ApiBearerAuth()
@Controller('admin/delivery-log')
export class DeliveryLogController {
  constructor(
    private readonly deliveryLog: DeliveryLogService,
    private readonly prisma: PrismaService,
    @InjectQueue('email') private readonly emailQueue: Queue,
    @InjectQueue('sms') private readonly smsQueue: Queue,
  ) {}

  @Get()
  @Roles('super_admin', 'principal')
  list(
    @Query('channel') channel?: NotificationChannel,
    @Query('status') status?: DeliveryStatus,
    @Query('type') typeCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
  ) {
    return this.deliveryLog.list({
      channel,
      status,
      typeCode,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? Number(page) : 1,
    });
  }

  @Get('stats')
  @Roles('super_admin', 'principal')
  stats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.deliveryLog.stats(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Post(':id/retry')
  @Roles('super_admin')
  async retry(@Param('id') id: string) {
    const delivery = await this.deliveryLog.retry(id);
    if (!delivery) return { ok: false };
    const notification = await this.prisma.notification.findUnique({
      where: { id: delivery.notificationId },
      include: { user: true },
    });
    if (!notification?.user?.email) return { queued: false };
    const queue = delivery.channel === 'sms' ? this.smsQueue : this.emailQueue;
    await queue.add('send', {
      deliveryId: delivery.id,
      to: notification.user.email,
      subject: notification.title,
      body: delivery.contentSnapshot ?? notification.body,
    });
    return { queued: true };
  }
}

@ApiTags('admin-suppression')
@ApiBearerAuth()
@Controller('admin/suppression-list')
export class SuppressionListController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('super_admin')
  list() {
    return this.prisma.suppressionList.findMany({
      orderBy: { suppressedAt: 'desc' },
    });
  }

  @Post()
  @Roles('super_admin')
  create(
    @Query('channel') channel: NotificationChannel,
    @Query('address') address: string,
  ) {
    return this.prisma.suppressionList.create({
      data: { channel, address: address.toLowerCase(), reason: 'manual' },
    });
  }

  @Post(':id/delete')
  @Roles('super_admin')
  remove(@Param('id') id: string) {
    return this.prisma.suppressionList.delete({ where: { id } });
  }
}
