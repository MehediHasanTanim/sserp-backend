import { FieldEncryptionService } from './field-encryption.service';
import { EncryptionPurpose } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

describe('FieldEncryptionService', () => {
  const masterMaterial = 'test-master-key-32-bytes-long!!!!';
  const config = {
    get: (k: string) =>
      k === 'fieldEncryptionMasterKey'
        ? masterMaterial
        : 'test-blind-index-key-32-bytes!!!!',
  };

  it('encrypts and decrypts round-trip', async () => {
    const raw = randomBytes(32);
    const master = createHash('sha256').update(masterMaterial).digest();
    const iv = randomBytes(12);
    const { createCipheriv } = require('crypto') as typeof import('crypto');
    const cipher = createCipheriv('aes-256-gcm', master, iv);
    const enc = Buffer.concat([cipher.update(raw), cipher.final()]);
    const wrapped = Buffer.concat([iv, cipher.getAuthTag(), enc]).toString(
      'base64',
    );

    const prisma = {
      encryptionKey: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'k1',
          keyVersion: 1,
          purpose: EncryptionPurpose.medical,
          wrappedKey: wrapped,
          isCurrent: true,
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'k1',
          keyVersion: 1,
          purpose: EncryptionPurpose.medical,
          wrappedKey: wrapped,
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const svc = new FieldEncryptionService(config as never, prisma as never);
    await svc.onModuleInit();
    const env = await svc.encrypt(EncryptionPurpose.medical, 'secret allergy');
    expect(env.v).toBe(1);
    expect(env.ct).toBeTruthy();
    const plain = await svc.decrypt(EncryptionPurpose.medical, env);
    expect(plain).toBe('secret allergy');
  });

  it('blind index is stable and not reversible by inspection', async () => {
    const prisma = {
      encryptionKey: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'k1',
          keyVersion: 1,
          purpose: 'medical',
          wrappedKey: Buffer.alloc(60).toString('base64'),
          isCurrent: true,
        }),
      },
    };
    const svc = new FieldEncryptionService(config as never, prisma as never);
    (svc as unknown as { blindKey: Buffer }).blindKey = createHash('sha256')
      .update('blind')
      .digest();
    const a = svc.blindIndex('Autism');
    const b = svc.blindIndex('autism');
    expect(a).toBe(b);
    expect(a).not.toContain('autism');
  });
});
