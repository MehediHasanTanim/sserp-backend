import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const BUCKET_POLICIES: Record<
  string,
  { maxBytes: number; mimeAllow: string[] }
> = {
  'student-documents': {
    maxBytes: 20 * 1024 * 1024,
    mimeAllow: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  'iep-documents': {
    maxBytes: 20 * 1024 * 1024,
    mimeAllow: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  'progress-reports': {
    maxBytes: 20 * 1024 * 1024,
    mimeAllow: ['application/pdf'],
  },
  'therapy-attachments': {
    maxBytes: 20 * 1024 * 1024,
    mimeAllow: ['application/pdf', 'image/jpeg', 'image/png', 'audio/mpeg'],
  },
  'hr-documents': {
    maxBytes: 50 * 1024 * 1024,
    mimeAllow: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  'invoices-receipts': {
    maxBytes: 20 * 1024 * 1024,
    mimeAllow: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  'activity-media': {
    maxBytes: 20 * 1024 * 1024,
    mimeAllow: ['image/jpeg', 'image/png', 'video/mp4'],
  },
  'leave-documents': {
    maxBytes: 20 * 1024 * 1024,
    mimeAllow: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  exports: {
    maxBytes: 50 * 1024 * 1024,
    mimeAllow: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ],
  },
};

@Injectable()
export class MinioService {
  private readonly client: Minio.Client;
  private readonly ttl: number;

  constructor(private readonly config: ConfigService) {
    this.client = new Minio.Client({
      endPoint: config.get<string>('minio.endpoint')!,
      port: config.get<number>('minio.port'),
      useSSL: config.get<boolean>('minio.useSSL'),
      accessKey: config.get<string>('minio.accessKey')!,
      secretKey: config.get<string>('minio.secretKey')!,
    });
    this.ttl = config.get<number>('minio.presignTtlSeconds') ?? 900;
  }

  get raw() {
    return this.client;
  }

  assertBucketPolicy(bucket: string, mimeType: string, sizeBytes: number) {
    const policy = BUCKET_POLICIES[bucket];
    if (!policy) {
      throw DomainException.validation(`Unknown bucket: ${bucket}`);
    }
    if (!policy.mimeAllow.includes(mimeType)) {
      throw new DomainException(
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        415,
        `MIME type ${mimeType} not allowed for ${bucket}`,
      );
    }
    if (sizeBytes > policy.maxBytes) {
      throw new DomainException(
        ErrorCode.FILE_TOO_LARGE,
        413,
        `File exceeds max size of ${policy.maxBytes} bytes`,
      );
    }
  }

  async presignUpload(bucket: string, mimeType: string, sizeBytes: number) {
    this.assertBucketPolicy(bucket, mimeType, sizeBytes);
    const objectKey = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
    const url = await this.client.presignedPutObject(
      bucket,
      objectKey,
      this.ttl,
    );
    return { url, bucket, objectKey, expiresInSeconds: this.ttl };
  }

  async objectExists(bucket: string, objectKey: string): Promise<boolean> {
    try {
      await this.client.statObject(bucket, objectKey);
      return true;
    } catch {
      return false;
    }
  }

  async presignDownload(bucket: string, objectKey: string) {
    return this.client.presignedGetObject(bucket, objectKey, this.ttl);
  }

  async removeObject(bucket: string, objectKey: string) {
    await this.client.removeObject(bucket, objectKey);
  }
}

@Injectable()
export class AttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  async confirm(input: {
    bucket: string;
    objectKey: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    entityType?: string;
    entityId?: string;
    uploadedBy: string;
  }) {
    const exists = await this.minio.objectExists(input.bucket, input.objectKey);
    if (!exists) {
      throw DomainException.unprocessable('Object not found in storage');
    }
    this.minio.assertBucketPolicy(
      input.bucket,
      input.mimeType,
      input.sizeBytes,
    );
    return this.prisma.attachment.create({
      data: {
        bucket: input.bucket,
        objectKey: input.objectKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        entityType: input.entityType,
        entityId: input.entityId,
        uploadedBy: input.uploadedBy,
        status: 'confirmed',
      },
    });
  }

  async downloadUrl(
    attachmentId: string,
    requesterId: string,
    isSuperAdmin: boolean,
  ) {
    const att = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null, status: 'confirmed' },
    });
    if (!att) throw DomainException.notFound('Attachment not found');
    if (!isSuperAdmin && att.uploadedBy !== requesterId) {
      // Phase 0: owner or super_admin; later phases add entity-scope checks
      throw DomainException.forbidden('Not allowed to download this file');
    }
    const url = await this.minio.presignDownload(att.bucket, att.objectKey);
    return { url, expiresInSeconds: 900, filename: att.originalFilename };
  }

  async softDelete(
    attachmentId: string,
    requesterId: string,
    isSuperAdmin: boolean,
  ) {
    const att = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
    });
    if (!att) throw DomainException.notFound('Attachment not found');
    if (!isSuperAdmin && att.uploadedBy !== requesterId) {
      throw DomainException.forbidden('Not allowed to delete this file');
    }
    await this.prisma.attachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date(), status: 'orphaned' },
    });
    // schedule deletion — immediate for Phase 0 simplicity
    await this.minio
      .removeObject(att.bucket, att.objectKey)
      .catch(() => undefined);
    return { ok: true };
  }

  async cleanupOrphans() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await this.prisma.attachment.findMany({
      where: { status: 'pending', createdAt: { lt: cutoff }, deletedAt: null },
    });
    for (const att of stale) {
      await this.minio
        .removeObject(att.bucket, att.objectKey)
        .catch(() => undefined);
      await this.prisma.attachment.update({
        where: { id: att.id },
        data: { status: 'orphaned', deletedAt: new Date() },
      });
    }
    return stale.length;
  }
}
