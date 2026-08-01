import { FieldEncryptionService } from '../../src/modules/hardening/services/field-encryption.service';
import { EncryptionPurpose } from '@prisma/client';

describe('Encryption integration (H-03/H-04)', () => {
  it('round-trips medical plaintext via envelope', async () => {
    const raw = Buffer.alloc(32, 9);
    const config = {
      get: () => 'integration-master-key-32bytes!!!!!',
    };
    const svc = new FieldEncryptionService(
      config as never,
      {
        encryptionKey: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(async ({ data }) => ({
            ...data,
            id: 'k1',
            keyVersion: 1,
          })),
        },
      } as never,
    );
    // manually seed
    (
      svc as unknown as { masterKey: Buffer; dataKeys: Map<string, Buffer> }
    ).masterKey = require('crypto')
      .createHash('sha256')
      .update(String(config.get()))
      .digest();
    (svc as unknown as { dataKeys: Map<string, Buffer> }).dataKeys.set(
      'medical:1',
      raw,
    );
    (
      svc as unknown as {
        currentVersion: (p: EncryptionPurpose) => Promise<number>;
      }
    ).currentVersion = async () => 1;
    (
      svc as unknown as {
        getDataKey: (p: EncryptionPurpose, v: number) => Promise<Buffer>;
      }
    ).getDataKey = async () => raw;

    const env = await svc.encrypt(EncryptionPurpose.medical, 'asthma');
    expect(JSON.stringify(env)).not.toContain('asthma');
    const plain = await svc.decrypt(EncryptionPurpose.medical, env);
    expect(plain).toBe('asthma');
  });
});
