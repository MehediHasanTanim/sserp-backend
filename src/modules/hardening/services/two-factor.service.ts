import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { ORG_SETTINGS_ID } from '../../notifications/constants';

@Injectable()
export class TwoFactorService {
  constructor(private readonly prisma: PrismaService) {}

  async enrol(userId: string) {
    const secret = authenticator.generateSecret();
    const recovery = Array.from({ length: 8 }, () =>
      randomBytes(4).toString('hex'),
    );
    const hashed = recovery.map((c) =>
      createHash('sha256').update(c).digest('hex'),
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: false,
        twoFactorRecoveryCodes: hashed,
      },
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const otpauth = authenticator.keyuri(user.email, 'SSERP', secret);
    return { secret, otpauth, recoveryCodes: recovery };
  }

  async verifyAndEnable(userId: string, token: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.twoFactorSecret) {
      throw DomainException.validation('2FA not enrolled');
    }
    const ok = authenticator.check(token, user.twoFactorSecret);
    if (!ok) throw DomainException.invalidCredentials('Invalid TOTP');
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
    return { ok: true };
  }

  async verifyLogin(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.twoFactorEnabled || !user.twoFactorSecret) return true;
    if (authenticator.check(token, user.twoFactorSecret)) return true;
    const hash = createHash('sha256').update(token).digest('hex');
    if (user.twoFactorRecoveryCodes.includes(hash)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorRecoveryCodes: user.twoFactorRecoveryCodes.filter(
            (c) => c !== hash,
          ),
        },
      });
      return true;
    }
    return false;
  }

  async isRequiredForRoles(roles: string[]): Promise<boolean> {
    const org = await this.prisma.organizationSettings.findUnique({
      where: { id: ORG_SETTINGS_ID },
    });
    const required = Array.isArray(org?.twoFactorRequiredRoles)
      ? (org!.twoFactorRequiredRoles as string[])
      : ['super_admin'];
    return roles.some((r) => required.includes(r));
  }
}
