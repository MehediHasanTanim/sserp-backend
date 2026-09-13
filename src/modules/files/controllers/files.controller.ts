import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
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

type UploadedMultipartFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

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

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  @Audit({ module: 'files', entity: 'attachment', action: 'upload' })
  upload(
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Body('bucket') bucket: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!bucket?.trim()) {
      throw new BadRequestException('bucket is required');
    }
    return this.minio.uploadBuffer(
      bucket.trim(),
      file.buffer,
      file.size,
      file.mimetype || 'application/octet-stream',
    );
  }

  @Post('confirm')
  @Audit({ module: 'files', entity: 'attachment', action: 'confirm' })
  confirm(@Body() dto: ConfirmDto, @CurrentUser() user: AuthUser) {
    return this.attachments.confirm({ ...dto, uploadedBy: user.id });
  }

  @Get(':attachmentId/download-url')
  download(@Param('attachmentId') id: string, @CurrentUser() user: AuthUser) {
    return this.attachments.downloadUrl(id, user.id, {
      isSuperAdmin: user.roles.includes('super_admin'),
      permissions: user.permissions ?? [],
    });
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
