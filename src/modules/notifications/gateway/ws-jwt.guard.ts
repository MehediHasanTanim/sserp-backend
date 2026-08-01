import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { readFileSync } from 'fs';
import { AccessClaims } from '../../auth/services/token.service';
import { AuthUser, PortalScopeClaim } from '../../../shared/decorators';

@Injectable()
export class WsJwtGuard {
  private readonly publicKey: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.publicKey = readFileSync(
      config.get<string>('jwt.publicKeyPath')!,
      'utf8',
    );
  }

  async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      const payload = await this.jwt.verifyAsync<AccessClaims>(token, {
        publicKey: this.publicKey,
        algorithms: ['RS256'],
      });
      const portalScope =
        payload.scope && typeof payload.scope === 'object'
          ? (payload.scope as PortalScopeClaim)
          : undefined;
      return {
        id: payload.sub,
        username: payload.username,
        email: payload.email,
        roles: payload.roles,
        permissions: payload.permissions,
        mustChangePassword: payload.mustChangePassword,
        jti: payload.jti,
        scope: payload.scope,
        portalScope,
      };
    } catch {
      return null;
    }
  }
}
