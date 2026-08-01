import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { CurrentUser, AuthUser, Roles } from '../../../shared/decorators';
import { NoticeBoardService } from '../services/notice-board.service';

class NoticeBoardDto {
  @IsString() title!: string;
  @IsString() body!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsArray() attachmentIds?: string[];
  @IsOptional() @IsBoolean() isPinned?: boolean;
}

@ApiTags('notice-board')
@ApiBearerAuth()
@Controller('notice-board')
export class NoticeBoardController {
  constructor(private readonly noticeBoard: NoticeBoardService) {}

  @Get()
  list() {
    return this.noticeBoard.list(true);
  }

  @Post()
  @Roles('coordinator', 'hr_officer', 'principal', 'super_admin')
  create(@CurrentUser() user: AuthUser, @Body() body: NoticeBoardDto) {
    return this.noticeBoard.create(user.id, body);
  }

  @Patch(':id')
  @Roles('coordinator', 'hr_officer', 'principal', 'super_admin')
  update(
    @Param('id') id: string,
    @Body() body: Partial<NoticeBoardDto & { isActive: boolean }>,
  ) {
    return this.noticeBoard.update(id, body);
  }

  @Delete(':id')
  @Roles('coordinator', 'hr_officer', 'principal', 'super_admin')
  remove(@Param('id') id: string) {
    return this.noticeBoard.remove(id);
  }
}
