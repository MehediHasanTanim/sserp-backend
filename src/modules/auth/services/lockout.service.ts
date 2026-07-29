import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService, CacheKeys } from '../../../shared/cache/redis.module';
import { DomainException } from '../../../shared/errors/domain-exception';

@Injectable()
export class LockoutService {
  constructor(
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  private get maxAttempts() {
    return this.config.get<number>('lockout.maxAttempts') ?? 5;
  }

  private get durationSeconds() {
    return (this.config.get<number>('lockout.durationMinutes') ?? 15) * 60;
  }

  async assertNotLocked(username: string) {
    const key = CacheKeys.lockout(username);
    const raw = await this.cache.get(key);
    if (!raw) return;
    const count = Number(raw);
    if (count >= this.maxAttempts) {
      throw DomainException.locked();
    }
  }

  async recordFailure(username: string): Promise<number> {
    const key = CacheKeys.lockout(username);
    const count = await this.cache.incr(key);
    if (count === 1) {
      await this.cache.expire(key, this.durationSeconds);
    }
    if (count >= this.maxAttempts) {
      await this.cache.expire(key, this.durationSeconds);
    }
    return count;
  }

  async reset(username: string) {
    await this.cache.del(CacheKeys.lockout(username));
  }

  async unlock(username: string) {
    await this.reset(username);
  }
}
