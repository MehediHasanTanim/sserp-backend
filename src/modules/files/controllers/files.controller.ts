import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CurrentUser, AuthUser, Audit } from '../../../shared/decorators';
import { AttachmentService, MinioService } from '../services/minio.service';

class PresignDto {
  @IsString() bucket!: string;
  @IsString() mimeType!: string;
  @IsInt() @Min(1) sizeBytes!: number;
}

class ConfirmDto {
  @IsString() bucket!: string;
  @IsString() objectKey!: string;
  @IsString() originalFilename!: string;
  @IsString() mimeType!: string;
  @IsInt() @Min(1) sizeBytes!: number;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
}

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(
    private readonly minio: MinioService,
    private readonly attachments: AttachmentService,
  ) {}

  @Post('presign-upload')
  presign(@Body() dto: PresignDto) {
    return this.minio.presignUpload(dto.bucket, dto.mimeType, dto.sizeBytes);
  }

  @Post('confirm')
  @Audit({ module: 'files', entity: 'attachment', action: 'confirm' })
  confirm(@Body() dto: ConfirmDto, @CurrentUser() user: AuthUser) {
    return this.attachments.confirm({ ...dto, uploadedBy: user.id });
  }

  @Get(':attachmentId/download-url')
  download(@Param('attachmentId') id: string, @CurrentUser() user: AuthUser) {
    return this.attachments.downloadUrl(
      id,
      user.id,
      user.roles.includes('super_admin'),
    );
  }

  @Delete(':attachmentId')
  @Audit({ module: 'files', entity: 'attachment', action: 'delete' })
  remove(@Param('attachmentId') id: string, @CurrentUser() user: AuthUser) {
    return this.attachments.softDelete(
      id,
      user.id,
      user.roles.includes('super_admin'),
    );
  }
}
