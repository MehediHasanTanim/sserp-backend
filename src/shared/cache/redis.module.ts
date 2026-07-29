import {
  Global,
  Module,
  OnModuleDestroy,
  Injectable,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class CacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  get client() {
    return this.redis;
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys);
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }
}

export const CacheKeys = {
  lockout: (username: string) => `lockout:${username.toLowerCase()}`,
  refresh: (hash: string) => `refresh:${hash}`,
  jtiBlacklist: (jti: string) => `jti:bl:${jti}`,
  passwordReset: (token: string) => `pwdreset:${token}`,
};

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redisUrl')!;
        return new Redis(url, {
          maxRetriesPerRequest: null,
          lazyConnect: false,
        });
      },
    },
    CacheService,
    {
      provide: 'REDIS_DESTROY',
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => {
        const hook: OnModuleDestroy = {
          onModuleDestroy: async () => {
            await redis.quit();
          },
        };
        return hook;
      },
    },
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule {}
