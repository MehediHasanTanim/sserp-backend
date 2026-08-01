/**
 * Backfill plaintext sensitive columns into AES-GCM envelopes.
 * Usage: FIELD_ENCRYPTION_MASTER_KEY=... npx ts-node scripts/backfill-field-encryption.ts
 */
import { PrismaClient, EncryptionPurpose } from '@prisma/client';
import {
  createCipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const prisma = new PrismaClient();
const master = createHash('sha256')
  .update(process.env.FIELD_ENCRYPTION_MASTER_KEY || 'dev-only-master-key-32bytes-long!!')
  .digest();

function wrapKey(raw: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', master, iv);
  const enc = Buffer.concat([cipher.update(raw), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function encrypt(key: Buffer, plaintext: string, version: number) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return JSON.stringify({
    v: version,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  });
}

function isEnvelope(s: string | null | undefined) {
  if (!s) return true;
  try {
    const p = JSON.parse(s);
    return p && p.v && p.iv && p.tag && p.ct;
  } catch {
    return false;
  }
}

async function ensureKey(purpose: EncryptionPurpose) {
  let row = await prisma.encryptionKey.findFirst({
    where: { purpose, isCurrent: true },
  });
  if (!row) {
    const raw = randomBytes(32);
    row = await prisma.encryptionKey.create({
      data: {
        keyVersion: 1,
        purpose,
        wrappedKey: wrapKey(raw),
        isCurrent: true,
      },
    });
    return { row, key: raw };
  }
  const buf = Buffer.from(row.wrappedKey, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const { createDecipheriv } = await import('crypto');
  const d = createDecipheriv('aes-256-gcm', master, iv);
  d.setAuthTag(tag);
  return { row, key: Buffer.concat([d.update(ct), d.final()]) };
}

async function main() {
  const medical = await ensureKey('medical');
  const notes = await prisma.sessionNote.findMany({ take: 5000 });
  for (const n of notes) {
    const data: Record<string, string> = {};
    if (n.narrative && !isEnvelope(n.narrative)) {
      data.narrative = encrypt(medical.key, n.narrative, medical.row.keyVersion);
    }
    if (n.observations && !isEnvelope(n.observations)) {
      data.observations = encrypt(
        medical.key,
        n.observations,
        medical.row.keyVersion,
      );
    }
    if (Object.keys(data).length) {
      await prisma.sessionNote.update({ where: { id: n.id }, data });
    }
  }
  console.log(`Backfill complete: scanned ${notes.length} session notes`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
