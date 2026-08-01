import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { Roles, CurrentUser, AuthUser } from '../../../shared/decorators';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TemplateRendererService } from '../services/template-renderer.service';
import { NotificationsService } from '../services/notification.service';
import { NotificationChannel } from '../constants';

class PatchTypeDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() defaultChannels?: string[];
}

class TemplateDto {
  @IsString() notificationTypeCode!: string;
  @IsString() channel!: NotificationChannel;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() body!: string;
  @IsArray() variables!: string[];
}

class TestSendDto {
  @IsString() typeCode!: string;
  @IsArray() channels!: NotificationChannel[];
  @IsOptional() variables?: Record<string, unknown>;
}

@ApiTags('admin-notifications')
@ApiBearerAuth()
@Controller('admin')
export class NotificationAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplateRendererService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('notification-types')
  @Roles('super_admin')
  listTypes() {
    return this.prisma.notificationType.findMany({ orderBy: { code: 'asc' } });
  }

  @Patch('notification-types/:code')
  @Roles('super_admin')
  patchType(@Param('code') code: string, @Body() body: PatchTypeDto) {
    return this.prisma.notificationType.update({
      where: { code },
      data: {
        isActive: body.isActive,
        defaultChannels: body.defaultChannels,
      },
    });
  }

  @Get('notification-templates')
  @Roles('super_admin')
  listTemplates() {
    return this.prisma.notificationTemplate.findMany({
      orderBy: [{ notificationTypeCode: 'asc' }, { channel: 'asc' }],
    });
  }

  @Post('notification-templates')
  @Roles('super_admin')
  createTemplate(@Body() body: TemplateDto, @CurrentUser() user: AuthUser) {
    this.templates.validateTemplate(body.body, body.variables);
    return this.prisma.notificationTemplate.create({
      data: {
        notificationTypeCode: body.notificationTypeCode,
        channel: body.channel as never,
        locale: body.locale ?? 'en',
        subject: body.subject,
        body: body.body,
        variables: body.variables,
        updatedBy: user.id,
      },
    });
  }

  @Patch('notification-templates/:id')
  @Roles('super_admin')
  patchTemplate(
    @Param('id') id: string,
    @Body() body: Partial<TemplateDto>,
    @CurrentUser() user: AuthUser,
  ) {
    if (body.body && body.variables) {
      this.templates.validateTemplate(body.body, body.variables);
    }
    return this.prisma.notificationTemplate.update({
      where: { id },
      data: {
        subject: body.subject,
        body: body.body,
        variables: body.variables,
        updatedBy: user.id,
      },
    });
  }

  @Post('notification-templates/:id/preview')
  @Roles('super_admin')
  async previewTemplate(
    @Param('id') id: string,
    @Body() sample: Record<string, unknown>,
  ) {
    const tpl = await this.prisma.notificationTemplate.findUnique({
      where: { id },
    });
    if (!tpl) return { error: 'not found' };
    const declared = Array.isArray(tpl.variables)
      ? (tpl.variables as string[])
      : ['title', 'body'];
    return this.templates.render({
      template: tpl.body,
      subject: tpl.subject,
      variables: sample,
      declaredVariables: declared,
      channel: tpl.channel as NotificationChannel,
    });
  }

  @Post('notifications/test-send')
  @Roles('super_admin')
  testSend(@CurrentUser() user: AuthUser, @Body() body: TestSendDto) {
    return this.notifications.createAndDispatch({
      userId: user.id,
      typeCode: body.typeCode,
      title: 'Test notification',
      body: 'This is a test send from admin.',
      channelsOverride: body.channels,
      variables: body.variables ?? { title: 'Test', body: 'Test body' },
    });
  }

  @Get('socket-sessions')
  @Roles('super_admin')
  socketSessions(@Query('active') active?: string) {
    return this.prisma.socketSession.findMany({
      where: active === 'true' ? { disconnectedAt: null } : undefined,
      orderBy: { connectedAt: 'desc' },
      take: 200,
    });
  }
}
