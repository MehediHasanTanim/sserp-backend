import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { CurrentUser, AuthUser, Roles } from '../../../shared/decorators';
import { AnnouncementService } from '../services/announcement.service';

class CreateAnnouncementDto {
  @IsString() title!: string;
  @IsString() body!: string;
  @IsString() audienceType!:
    'all_staff' | 'departments' | 'roles' | 'specific_users';
  @IsOptional() audience?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isPinned?: boolean;
  @IsOptional() @IsArray() attachmentIds?: string[];
}

@ApiTags('announcements')
@ApiBearerAuth()
@Controller('announcements')
export class AnnouncementController {
  constructor(private readonly announcements: AnnouncementService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.announcements.listVisible(user.id, user.roles);
  }

  @Post()
  @Roles('principal', 'coordinator', 'hr_officer', 'super_admin')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAnnouncementDto) {
    return this.announcements.create(user.id, body);
  }

  @Patch(':id')
  @Roles('principal', 'coordinator', 'hr_officer', 'super_admin')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Partial<CreateAnnouncementDto>,
  ) {
    return this.announcements.updateDraft(user.id, id, body as never);
  }

  @Post(':id/publish')
  @Roles('principal', 'coordinator', 'hr_officer', 'super_admin')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcements.publish(user.id, id);
  }

  @Post(':id/withdraw')
  @Roles('principal', 'coordinator', 'hr_officer', 'super_admin')
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcements.withdraw(user.id, id);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcements.markRead(user.id, id);
  }

  @Get(':id/read-stats')
  readStats(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcements.readStats(user.id, user.roles, id);
  }
}
