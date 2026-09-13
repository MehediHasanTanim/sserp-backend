import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { PrismaService } from '../../../shared/prisma/prisma.service';

/** Logical folders inside the single R2/S3 bucket (API still calls these `bucket`). */
export const STORAGE_FOLDERS = [
  'student-documents',
  'iep-documents',
  'progress-reports',
  'therapy-attachments',
  'hr-documents',
  'invoices-receipts',
  'activity-media',
  'leave-documents',
  'exports',
] as const;

export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

/** Module read permissions that may download objects in a logical folder. */
const FOLDER_READ_PERMISSIONS: Record<StorageFolder, string[]> = {
  'student-documents': ['school:read'],
  'iep-documents': ['school:read'],
  'progress-reports': ['school:read'],
  'therapy-attachments': ['therapy:read'],
  'hr-documents': ['hr:read'],
  'invoices-receipts': ['accounts:read', 'school:read'],
  'activity-media': ['school:read'],
  'leave-documents': ['hr:read'],
  exports: ['hr:read', 'school:read', 'accounts:read', 'admin:read'],
};

function canReadStorageFolder(
  folder: string,
  permissions: string[],
): boolean {
  const allowed = FOLDER_READ_PERMISSIONS[folder as StorageFolder];
  if (!allowed) return false;
  return allowed.some((p) => permissions.includes(p));
}

const FOLDER_POLICIES: Record<
  StorageFolder,
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
    mimeAllow: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
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
  private readonly bucketName: string;
  private readonly publicUrlBase: string;

  constructor(private readonly config: ConfigService) {
    const useSSL = config.get<boolean>('storage.useSSL') ?? true;
    const port = config.get<number>('storage.port') ?? (useSSL ? 443 : 9000);
    this.client = new Minio.Client({
      endPoint: config.get<string>('storage.endpoint')!,
      port,
      useSSL,
      accessKey: config.get<string>('storage.accessKey')!,
      secretKey: config.get<string>('storage.secretKey')!,
      region: config.get<string>('storage.region') ?? 'auto',
      pathStyle: config.get<boolean>('storage.pathStyle') ?? true,
    });
    this.ttl = config.get<number>('storage.presignTtlSeconds') ?? 900;
    this.bucketName = config.get<string>('storage.bucketName')!;
    this.publicUrlBase = (
      config.get<string>('storage.publicUrl') ?? ''
    ).replace(/\/$/, '');
  }

  /** Physical R2/S3 bucket (e.g. sserp). */
  get physicalBucket() {
    return this.bucketName;
  }

  get raw() {
    return this.client;
  }

  async ping(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucketName);
    if (!exists) {
      throw new Error(
        `Object storage bucket "${this.bucketName}" does not exist`,
      );
    }
  }

  assertFolderPolicy(folder: string, mimeType: string, sizeBytes: number) {
    const policy = FOLDER_POLICIES[folder as StorageFolder];
    if (!policy) {
      throw DomainException.validation(
        `Unknown storage folder: ${folder}. Allowed: ${STORAGE_FOLDERS.join(', ')}`,
      );
    }
    if (!policy.mimeAllow.includes(mimeType)) {
      throw new DomainException(
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        415,
        `MIME type ${mimeType} not allowed for ${folder}`,
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

  /** Resolve object key so logical folder is always the first path segment. */
  resolveObjectKey(folder: string, objectKey: string): string {
    const key = objectKey.replace(/^\/+/, '');
    if (key === folder || key.startsWith(`${folder}/`)) return key;
    return `${folder}/${key}`;
  }

  /**
   * Cloudflare R2 "folders" are object-key prefixes, not real directories.
   * Some clients still expect a `${folder}/` placeholder object to exist.
   *
   * This creates a zero-byte object at `${folder}/` if it doesn't already exist.
   */
  private async ensureFolderPrefix(folder: string): Promise<void> {
    const prefixKey = `${folder}/`;
    try {
      // If any object exists under `${folder}/...`, this stat may still fail;
      // but creating the placeholder is harmless and helps clients that require it.
      await this.client.statObject(this.bucketName, prefixKey);
    } catch {
      await this.client.putObject(
        this.bucketName,
        prefixKey,
        Buffer.alloc(0),
        0,
        { 'Content-Type': 'application/x-directory' },
      );
    }
  }

  async putObject(
    folder: string,
    relativeKey: string,
    buffer: Buffer,
    size: number,
    meta: Record<string, string>,
  ) {
    this.assertFolderPolicy(
      folder,
      meta['Content-Type'] ?? 'application/octet-stream',
      size,
    );
    await this.ensureFolderPrefix(folder);
    const objectKey = this.resolveObjectKey(folder, relativeKey);
    await this.client.putObject(
      this.bucketName,
      objectKey,
      buffer,
      size,
      meta,
    );
    return objectKey;
  }

  async presignUpload(folder: string, mimeType: string, sizeBytes: number) {
    this.assertFolderPolicy(folder, mimeType, sizeBytes);
    await this.ensureFolderPrefix(folder);
    const objectKey = `${folder}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
    const url = await this.client.presignedPutObject(
      this.bucketName,
      objectKey,
      this.ttl,
    );
    return {
      url,
      /** Logical folder (API contract). */
      bucket: folder,
      objectKey,
      expiresInSeconds: this.ttl,
    };
  }

  /** Server-side upload (avoids browser CORS to R2/MinIO). */
  async uploadBuffer(
    folder: string,
    buffer: Buffer,
    sizeBytes: number,
    mimeType: string,
  ) {
    this.assertFolderPolicy(folder, mimeType, sizeBytes);
    await this.ensureFolderPrefix(folder);
    const objectKey = `${folder}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
    await this.client.putObject(this.bucketName, objectKey, buffer, sizeBytes, {
      'Content-Type': mimeType,
    });
    return {
      bucket: folder,
      objectKey,
    };
  }

  async objectExists(folder: string, objectKey: string): Promise<boolean> {
    try {
      await this.client.statObject(
        this.bucketName,
        this.resolveObjectKey(folder, objectKey),
      );
      return true;
    } catch {
      return false;
    }
  }

  async presignDownload(folder: string, objectKey: string) {
    const key = this.resolveObjectKey(folder, objectKey);
    if (this.publicUrlBase) {
      return `${this.publicUrlBase}/${key}`;
    }
    return this.client.presignedGetObject(this.bucketName, key, this.ttl);
  }

  async removeObject(folder: string, objectKey: string) {
    await this.client.removeObject(
      this.bucketName,
      this.resolveObjectKey(folder, objectKey),
    );
  }

  /** @deprecated Prefer putObject / resolveObjectKey — kept for rare raw access. */
  assertBucketPolicy(bucket: string, mimeType: string, sizeBytes: number) {
    this.assertFolderPolicy(bucket, mimeType, sizeBytes);
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
    const objectKey = this.minio.resolveObjectKey(
      input.bucket,
      input.objectKey,
    );
    const exists = await this.minio.objectExists(input.bucket, objectKey);
    if (!exists) {
      throw DomainException.unprocessable('Object not found in storage');
    }
    this.minio.assertFolderPolicy(
      input.bucket,
      input.mimeType,
      input.sizeBytes,
    );
    return this.prisma.attachment.create({
      data: {
        bucket: input.bucket,
        objectKey,
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
    options: { isSuperAdmin: boolean; permissions: string[] },
  ) {
    const att = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null, status: 'confirmed' },
    });
    if (!att) throw DomainException.notFound('Attachment not found');

    const canDownload =
      options.isSuperAdmin ||
      att.uploadedBy === requesterId ||
      canReadStorageFolder(att.bucket, options.permissions);
    if (!canDownload) {
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
