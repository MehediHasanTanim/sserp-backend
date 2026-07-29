import { PasswordService } from './password.service';
import { ConfigService } from '@nestjs/config';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';

describe('PasswordService', () => {
  const service = new PasswordService({
    get: () => 12,
  } as unknown as ConfigService);

  it('rejects each policy rule individually', () => {
    expect(() => service.validatePolicy('short1A')).toThrow(DomainException);
    expect(() => service.validatePolicy('nouppercase1')).toThrow(
      DomainException,
    );
    expect(() => service.validatePolicy('NOLOWERCASE1')).toThrow(
      DomainException,
    );
    expect(() => service.validatePolicy('NoDigitsHere')).toThrow(
      DomainException,
    );
  });

  it('accepts a valid password and hashes with cost 12', async () => {
    const hash = await service.hash('ValidPass1');
    expect(hash.startsWith('$2b$12$') || hash.startsWith('$2a$12$')).toBe(true);
    expect(await service.verify('ValidPass1', hash)).toBe(true);
  });

  it('enforces history of last 3', async () => {
    const h1 = await service.hash('ValidPass1');
    await expect(
      service.assertNotInHistoryAsync('ValidPass1', [h1]),
    ).rejects.toMatchObject({ code: ErrorCode.WEAK_PASSWORD });
  });
});
