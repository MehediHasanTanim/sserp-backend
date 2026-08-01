import { TwoFactorService } from '../../src/modules/hardening/services/two-factor.service';
import { authenticator } from 'otplib';
import { createHash } from 'crypto';

describe('2FA (enrol/verify/recovery)', () => {
  it('enables after valid TOTP and accepts recovery once', async () => {
    const secret = authenticator.generateSecret();
    const recovery = 'deadbeef';
    const hashed = createHash('sha256').update(recovery).digest('hex');
    const user = {
      id: 'u1',
      email: 'a@test.com',
      twoFactorSecret: secret,
      twoFactorEnabled: true,
      twoFactorRecoveryCodes: [hashed],
    };
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockImplementation(async ({ data }) => {
          Object.assign(user, data);
          return user;
        }),
      },
      organizationSettings: {
        findUnique: jest.fn().mockResolvedValue({
          twoFactorRequiredRoles: ['super_admin'],
        }),
      },
    };
    const svc = new TwoFactorService(prisma as never);
    const token = authenticator.generate(secret);
    expect(await svc.verifyLogin('u1', token)).toBe(true);
    expect(await svc.verifyLogin('u1', recovery)).toBe(true);
    expect(await svc.verifyLogin('u1', recovery)).toBe(false);
  });
});
