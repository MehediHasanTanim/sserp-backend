import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CacheService, CacheKeys } from '../../../shared/cache/redis.module';
import { DomainException } from '../../../shared/errors/domain-exception';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventNames } from '../../../shared/events/event-names';

export interface AccessClaims {
  sub: string;
  roles: string[];
  permissions: string[];
  scope?: string | { studentIds: string[]; guardianProfileId: string };
  jti: string;
  mustChangePassword: boolean;
  username: string;
  email: string;
}

@Injectable()
export class TokenService {
  private readonly privateKey: string;
  private readonly publicKey: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly events: EventEmitter2,
  ) {
    this.privateKey = readFileSync(
      this.config.get<string>('jwt.privateKeyPath')!,
      'utf8',
    );
    this.publicKey = readFileSync(
      this.config.get<string>('jwt.publicKeyPath')!,
      'utf8',
    );
  }

  get publicKeyPem() {
    return this.publicKey;
  }

  hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTtlSeconds() {
    const ttl = this.config.get<string>('jwt.refreshTtl') ?? '7d';
    if (ttl.endsWith('d')) return Number(ttl.slice(0, -1)) * 86400;
    if (ttl.endsWith('h')) return Number(ttl.slice(0, -1)) * 3600;
    if (ttl.endsWith('m')) return Number(ttl.slice(0, -1)) * 60;
    return Number(ttl);
  }

  async signAccess(claims: Omit<AccessClaims, 'jti'> & { jti?: string }) {
    const jti = claims.jti ?? randomUUID();
    const accessTtl = this.config.get<string>('jwt.accessTtl') ?? '15m';
    const token = await this.jwt.signAsync(
      { ...claims, jti },
      {
        privateKey: this.privateKey,
        algorithm: 'RS256',
        expiresIn: accessTtl,
      },
    );
    return { token, jti };
  }

  async issueRefresh(params: {
    userId: string;
    familyId?: string;
    userAgent?: string;
    ipAddress?: string;
  }) {
    const raw = randomUUID();
    const hash = this.hashToken(raw);
    const familyId = params.familyId ?? randomUUID();
    const ttl = this.refreshTtlSeconds();
    const expiresAt = new Date(Date.now() + ttl * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId: params.userId,
        tokenHash: hash,
        familyId,
        expiresAt,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      },
    });
    await this.cache.set(CacheKeys.refresh(hash), params.userId, ttl);
    return { raw, hash, familyId, expiresAt };
  }

  async rotateRefresh(
    raw: string,
    meta: { userAgent?: string; ipAddress?: string },
  ) {
    const hash = this.hashToken(raw);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash },
    });
    if (!existing) {
      throw DomainException.invalidCredentials('Invalid refresh token');
    }
    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      await this.events.emitAsync(EventNames.AUTH_TOKEN_REUSE, {
        userId: existing.userId,
        familyId: existing.familyId,
        ip: meta.ipAddress,
      });
      throw DomainException.invalidCredentials('Refresh token reuse detected');
    }
    if (existing.expiresAt < new Date()) {
      throw DomainException.invalidCredentials('Refresh token expired');
    }

    const next = await this.issueRefresh({
      userId: existing.userId,
      familyId: existing.familyId,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: undefined },
    });
    await this.cache.del(CacheKeys.refresh(hash));
    return { userId: existing.userId, ...next };
  }

  async revokeRaw(raw: string) {
    const hash = this.hashToken(raw);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash },
    });
    if (!existing) return;
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    await this.cache.del(CacheKeys.refresh(hash));
  }

  async revokeFamily(familyId: string) {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { familyId, revokedAt: null },
    });
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    for (const t of tokens) {
      await this.cache.del(CacheKeys.refresh(t.tokenHash));
    }
  }

  async revokeAllForUser(userId: string) {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    for (const t of tokens) {
      await this.cache.del(CacheKeys.refresh(t.tokenHash));
    }
  }

  async blacklistJti(jti: string, ttlSeconds: number) {
    await this.cache.set(CacheKeys.jtiBlacklist(jti), '1', ttlSeconds);
  }
}
