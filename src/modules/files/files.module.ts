import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FilesController } from './controllers/files.controller';
import { AttachmentService, MinioService } from './services/minio.service';
import { PdfRendererService } from './pdf/pdf-renderer.service';
import { PdfProcessor } from './pdf/pdf.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'pdf' })],
  controllers: [FilesController],
  providers: [MinioService, AttachmentService, PdfRendererService, PdfProcessor],
  exports: [MinioService, AttachmentService, PdfRendererService],
})
export class FilesModule {}
