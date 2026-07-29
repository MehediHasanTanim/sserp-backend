import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  PrismaHealthIndicator,
  TerminusModule,
} from '@nestjs/terminus';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CacheService } from '../../shared/cache/redis.module';
import { MinioService } from '../files/services/minio.service';
import { Public } from '../../shared/decorators';
import { FilesModule } from '../files/files.module';
import { HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class RedisHealthIndicator {
  constructor(private readonly cache: CacheService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.cache.client.ping();
      if (pong !== 'PONG') throw new Error('no pong');
      return { [key]: { status: 'up' } };
    } catch {
      return { [key]: { status: 'down' } };
    }
  }
}

@Injectable()
export class MinioHealthIndicator {
  constructor(private readonly minio: MinioService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.minio.raw.listBuckets();
      return { [key]: { status: 'up' } };
    } catch {
      return { [key]: { status: 'down' } };
    }
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisHealthIndicator,
    private readonly minio: MinioHealthIndicator,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  async ready() {
    const redis = await this.redis.isHealthy('redis');
    const minio = await this.minio.isHealthy('minio');
    if (redis.redis.status === 'down' || minio.minio.status === 'down') {
      throw new HttpException(
        { status: 'error', details: { redis, minio } },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.health.check([
      () => this.prismaIndicator.pingCheck('postgres', this.prisma),
      async () => redis,
      async () => minio,
    ]);
  }
}

@Module({
  imports: [TerminusModule, FilesModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator, MinioHealthIndicator],
})
export class HealthModule {}
