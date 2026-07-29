import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_KEY } from '../decorators';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method = req.method as string;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next.handle();
    }

    const meta = this.reflector.getAllAndOverride<{
      module: string;
      entity: string;
      action?: string;
    }>(AUDIT_KEY, [context.getHandler(), context.getClass()]);

    return next.handle().pipe(
      tap(async (data) => {
        try {
          const userId = req.user?.id ?? null;
          const entityId =
            (data as { id?: string })?.id ?? req.params?.id ?? null;
          await this.prisma.auditLog.create({
            data: {
              userId,
              action: meta?.action ?? method,
              module: meta?.module ?? 'unknown',
              entityName: meta?.entity ?? 'unknown',
              entityId: entityId ? String(entityId) : null,
              beforeValue: req.auditBefore ?? undefined,
              afterValue: (data as object) ?? undefined,
              ipAddress: req.ip ?? null,
              requestId: req.requestId ?? null,
            },
          });
        } catch {
          // Never fail the request because of audit write issues
        }
      }),
    );
  }
}
