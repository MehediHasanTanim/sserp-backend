import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { IDEMPOTENT_KEY } from '../decorators';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(
      IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!isIdempotent) return next.handle();

    const req = context.switchToHttp().getRequest();
    const key = req.header('idempotency-key');
    if (!key) return next.handle();

    const userId = req.user?.id;
    if (!userId) return next.handle();

    const endpoint = `${req.method}:${req.route?.path ?? req.path}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key_endpoint: { key, endpoint } },
    });
    if (existing && existing.expiresAt > new Date()) {
      const res = context.switchToHttp().getResponse();
      res.status(existing.responseStatus);
      return of(existing.responseBody);
    }

    return next.handle().pipe(
      tap(async (body) => {
        const res = context.switchToHttp().getResponse();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await this.prisma.idempotencyKey.upsert({
          where: { key_endpoint: { key, endpoint } },
          create: {
            key,
            userId,
            endpoint,
            requestHash,
            responseStatus: res.statusCode,
            responseBody: body as object,
            expiresAt,
          },
          update: {
            requestHash,
            responseStatus: res.statusCode,
            responseBody: body as object,
            expiresAt,
          },
        });
      }),
    );
  }
}
