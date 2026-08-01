import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { CurrentUser, AuthUser, Roles } from '../../../shared/decorators';
import { MessageService } from '../services/message.service';

class CreateThreadDto {
  @IsString() threadType!: 'direct' | 'group';
  @IsOptional() @IsString() subject?: string;
  @IsArray() participantUserIds!: string[];
  @IsOptional() @IsString() department?: string;
}

class PostMessageDto {
  @IsString() body!: string;
  @IsOptional() @IsArray() attachmentIds?: string[];
  @IsOptional() @IsString() replyToMessageId?: string;
}

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
export class MessageController {
  constructor(private readonly messages: MessageService) {}

  @Get('threads')
  listThreads(@CurrentUser() user: AuthUser) {
    return this.messages.listThreads(user.id);
  }

  @Post('threads')
  createThread(@CurrentUser() user: AuthUser, @Body() body: CreateThreadDto) {
    return this.messages.createThread(user.id, body);
  }

  @Get('threads/:id')
  getThread(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page') page?: string,
  ) {
    return this.messages.getThreadMessages(
      user.id,
      id,
      page ? Number(page) : 1,
    );
  }

  @Post('threads/:id/messages')
  postMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: PostMessageDto,
  ) {
    return this.messages.postMessage(user.id, id, body);
  }

  @Patch(':id')
  editMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('body') body: string,
  ) {
    return this.messages.editMessage(user.id, id, body);
  }

  @Delete(':id')
  deleteMessage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const isAdmin = user.roles.includes('super_admin');
    return this.messages.deleteMessage(user.id, id, isAdmin);
  }

  @Post('threads/:id/read')
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id') threadId: string,
    @Body('messageId') messageId: string,
  ) {
    return this.messages.markRead(user.id, threadId, messageId);
  }

  @Post('threads/:id/participants')
  addParticipant(
    @CurrentUser() user: AuthUser,
    @Param('id') threadId: string,
    @Body('userId') userId: string,
  ) {
    return this.messages.addParticipant(user.id, threadId, userId);
  }

  @Post('threads/:id/mute')
  mute(
    @CurrentUser() user: AuthUser,
    @Param('id') threadId: string,
    @Body('muted') muted: boolean,
  ) {
    return this.messages.mute(user.id, threadId, muted ?? true);
  }

  @Post('threads/:id/close')
  close(@CurrentUser() user: AuthUser, @Param('id') threadId: string) {
    return this.messages.closeThread(user.id, threadId);
  }
}
