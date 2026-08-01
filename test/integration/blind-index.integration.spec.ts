import { FieldEncryptionService } from '../../src/modules/hardening/services/field-encryption.service';

describe('Blind index (H-03)', () => {
  it('equality filter hash is stable', () => {
    const svc = Object.create(
      FieldEncryptionService.prototype,
    ) as FieldEncryptionService;
    (svc as unknown as { blindKey: Buffer }).blindKey = Buffer.alloc(32, 1);
    const h1 = svc.blindIndex('ADHD');
    const h2 = svc.blindIndex('adhd');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
});
