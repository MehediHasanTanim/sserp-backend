import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuthUser } from '../../../shared/decorators';

export type RlsContext = {
  userId: string;
  roles: string[];
  scopedStudentIds?: string[];
};

/**
 * Sets Postgres session GUCs used by RLS policies (H-02).
 * Fail-closed: when unset, policies return zero rows.
 */
@Injectable()
export class RlsContextService {
  constructor(private readonly prisma: PrismaService) {}

  fromAuthUser(user: AuthUser): RlsContext {
    const scoped =
      user.portalScope?.studentIds ??
      (user.scope &&
      typeof user.scope === 'object' &&
      'studentIds' in user.scope
        ? (user.scope as { studentIds: string[] }).studentIds
        : undefined);
    return {
      userId: user.id,
      roles: user.roles ?? [],
      scopedStudentIds: scoped,
    };
  }

  async apply(
    ctx: RlsContext,
    client: PrismaClient | Prisma.TransactionClient = this.prisma,
  ) {
    const roles = ctx.roles.join(',');
    const students = (ctx.scopedStudentIds ?? []).join(',');
    await client.$executeRawUnsafe(
      `SELECT set_config('app.current_user_id', $1, true)`,
      ctx.userId,
    );
    await client.$executeRawUnsafe(
      `SELECT set_config('app.current_roles', $1, true)`,
      roles,
    );
    await client.$executeRawUnsafe(
      `SELECT set_config('app.scoped_student_ids', $1, true)`,
      students,
    );
  }

  async withContext<T>(
    ctx: RlsContext,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.apply(ctx, tx);
      return fn(tx);
    });
  }
}
