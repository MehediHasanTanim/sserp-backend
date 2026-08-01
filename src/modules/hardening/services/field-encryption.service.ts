import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  createHash,
} from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionPurpose } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export type EncryptionEnvelope = {
  v: number;
  iv: string;
  tag: string;
  ct: string;
};

export const ENCRYPTED_FIELD_REGISTRY: Record<
  string,
  { purpose: EncryptionPurpose; json?: boolean }
> = {
  'studentMedicalRecord.conditions': { purpose: 'medical', json: true },
  'studentMedicalRecord.allergies': { purpose: 'medical', json: true },
  'studentMedicalRecord.medications': { purpose: 'medical', json: true },
  'studentMedicalRecord.emergencyProtocol': { purpose: 'medical' },
  'patientMedicalHistory.existingConditions': {
    purpose: 'medical',
    json: true,
  },
  'patientMedicalHistory.medications': { purpose: 'medical', json: true },
  'patientMedicalHistory.allergies': { purpose: 'medical', json: true },
  'patientMedicalHistory.pastTherapyHistory': { purpose: 'medical' },
  'sessionNote.narrative': { purpose: 'medical' },
  'sessionNote.observations': { purpose: 'medical' },
  'student.disabilityCategory': { purpose: 'medical' },
  'student.severityLevel': { purpose: 'medical' },
  'employee.nationalId': { purpose: 'financial' },
  'vendor.bankDetails': { purpose: 'financial', json: true },
  'shareholder.bankDetails': { purpose: 'financial', json: true },
  'shareholder.taxIdentifier': { purpose: 'financial' },
};

function isEnvelope(value: unknown): value is EncryptionEnvelope {
  return (
    !!value &&
    typeof value === 'object' &&
    'v' in (value as object) &&
    'iv' in (value as object) &&
    'tag' in (value as object) &&
    'ct' in (value as object)
  );
}

@Injectable()
export class FieldEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(FieldEncryptionService.name);
  private masterKey!: Buffer;
  private blindKey!: Buffer;
  private dataKeys = new Map<string, Buffer>(); // purpose:version -> key

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.masterKey = this.deriveKey(
      this.config.get<string>('fieldEncryptionMasterKey') ?? '',
    );
    this.blindKey = this.deriveKey(
      this.config.get<string>('blindIndexKey') ?? '',
    );
    await this.ensureCurrentKeys();
  }

  private deriveKey(material: string): Buffer {
    return createHash('sha256')
      .update(material || 'dev-fallback')
      .digest();
  }

  private cacheKey(purpose: EncryptionPurpose, version: number) {
    return `${purpose}:${version}`;
  }

  async ensureCurrentKeys() {
    for (const purpose of ['medical', 'financial'] as EncryptionPurpose[]) {
      let current = await this.prisma.encryptionKey.findFirst({
        where: { purpose, isCurrent: true },
      });
      if (!current) {
        const raw = randomBytes(32);
        const wrapped = this.wrapKey(raw);
        current = await this.prisma.encryptionKey.create({
          data: {
            keyVersion: 1,
            purpose,
            wrappedKey: wrapped,
            isCurrent: true,
          },
        });
        this.logger.log(`Created encryption key ${purpose} v1`);
      }
      this.dataKeys.set(
        this.cacheKey(purpose, current.keyVersion),
        this.unwrapKey(current.wrappedKey),
      );
    }
  }

  wrapKey(raw: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const enc = Buffer.concat([cipher.update(raw), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  unwrapKey(wrapped: string): Buffer {
    const buf = Buffer.from(wrapped, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }

  async currentVersion(purpose: EncryptionPurpose): Promise<number> {
    const row = await this.prisma.encryptionKey.findFirst({
      where: { purpose, isCurrent: true },
    });
    return row?.keyVersion ?? 1;
  }

  private async getDataKey(
    purpose: EncryptionPurpose,
    version: number,
  ): Promise<Buffer> {
    const ck = this.cacheKey(purpose, version);
    const cached = this.dataKeys.get(ck);
    if (cached) return cached;
    const row = await this.prisma.encryptionKey.findUnique({
      where: { purpose_keyVersion: { purpose, keyVersion: version } },
    });
    if (!row) throw new Error(`Missing encryption key ${purpose} v${version}`);
    const key = this.unwrapKey(row.wrappedKey);
    this.dataKeys.set(ck, key);
    return key;
  }

  async encrypt(
    purpose: EncryptionPurpose,
    plaintext: string,
  ): Promise<EncryptionEnvelope> {
    const version = await this.currentVersion(purpose);
    const key = await this.getDataKey(purpose, version);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      v: version,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: ct.toString('base64'),
    };
  }

  async decrypt(
    purpose: EncryptionPurpose,
    envelope: EncryptionEnvelope,
  ): Promise<string> {
    const key = await this.getDataKey(purpose, envelope.v);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ct, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  async encryptValue(
    purpose: EncryptionPurpose,
    value: unknown,
    asJson?: boolean,
  ): Promise<unknown> {
    if (value == null) return value;
    if (isEnvelope(value)) return value;
    if (typeof value === 'string' && value.startsWith('{"v":')) {
      try {
        const parsed = JSON.parse(value);
        if (isEnvelope(parsed)) return asJson ? parsed : value;
      } catch {
        /* plaintext */
      }
    }
    const plaintext = asJson ? JSON.stringify(value) : String(value);
    const env = await this.encrypt(purpose, plaintext);
    return asJson ? env : JSON.stringify(env);
  }

  async decryptValue(
    purpose: EncryptionPurpose,
    value: unknown,
    asJson?: boolean,
  ): Promise<unknown> {
    if (value == null) return value;
    let envelope: EncryptionEnvelope | null = null;
    if (isEnvelope(value)) envelope = value;
    else if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (isEnvelope(parsed)) envelope = parsed;
      } catch {
        return value;
      }
    }
    if (!envelope) return value;
    const plain = await this.decrypt(purpose, envelope);
    if (asJson) {
      try {
        return JSON.parse(plain);
      } catch {
        return plain;
      }
    }
    return plain;
  }

  blindIndex(plaintext: string): string {
    return createHmac('sha256', this.blindKey)
      .update(plaintext.toLowerCase().trim())
      .digest('hex');
  }

  async rotatePurpose(purpose: EncryptionPurpose): Promise<void> {
    const current = await this.prisma.encryptionKey.findFirst({
      where: { purpose, isCurrent: true },
    });
    const nextVersion = (current?.keyVersion ?? 0) + 1;
    const raw = randomBytes(32);
    await this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.encryptionKey.update({
          where: { id: current.id },
          data: { isCurrent: false, retiredAt: new Date() },
        });
      }
      await tx.encryptionKey.create({
        data: {
          keyVersion: nextVersion,
          purpose,
          wrappedKey: this.wrapKey(raw),
          isCurrent: true,
        },
      });
    });
    this.dataKeys.set(this.cacheKey(purpose, nextVersion), raw);
  }
}
