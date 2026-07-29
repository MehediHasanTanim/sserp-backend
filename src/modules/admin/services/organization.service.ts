import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { NumberingResetPeriod, Prisma } from '@prisma/client';
import { TxClient } from '../../../shared/prisma/transaction.helper';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublic() {
    const org = await this.prisma.organizationSettings.findUnique({
      where: { id: ORG_ID },
    });
    if (!org) throw DomainException.notFound('Organization not configured');
    return {
      name: org.name,
      logoObjectKey: org.logoObjectKey,
      timezone: org.timezone,
      currencyCode: org.currencyCode,
      currencyMinorUnits: org.currencyMinorUnits,
      dateFormat: org.dateFormat,
    };
  }

  async getFull() {
    const org = await this.prisma.organizationSettings.findUnique({
      where: { id: ORG_ID },
    });
    if (!org) throw DomainException.notFound('Organization not configured');
    return org;
  }

  async update(data: Prisma.OrganizationSettingsUpdateInput) {
    return this.prisma.organizationSettings.update({
      where: { id: ORG_ID },
      data,
    });
  }
}

@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.numberingScheme.findMany({
      orderBy: { entityType: 'asc' },
    });
  }

  async update(
    entityType: string,
    data: {
      prefix?: string;
      padding?: number;
      resetPeriod?: NumberingResetPeriod;
    },
  ) {
    return this.prisma.numberingScheme.update({
      where: { entityType },
      data,
    });
  }

  /** Gap-free allocation; pass tx when nesting inside a caller transaction. */
  async nextCode(entityType: string, tx?: TxClient): Promise<string> {
    if (tx) {
      return this.allocate(entityType, tx);
    }
    return this.prisma.$transaction((inner) =>
      this.allocate(entityType, inner),
    );
  }

  private async allocate(
    entityType: string,
    client: TxClient,
  ): Promise<string> {
    const rows = await client.$queryRaw<
      Array<{
        id: string;
        prefix: string;
        padding: number;
        current_sequence: number;
        reset_period: string;
        last_reset_at: Date | null;
      }>
    >`
      SELECT id, prefix, padding, current_sequence, reset_period::text, last_reset_at
      FROM numbering_schemes
      WHERE entity_type = ${entityType}
      FOR UPDATE
    `;
    if (!rows.length) {
      throw DomainException.notFound(
        `Numbering scheme ${entityType} not found`,
      );
    }
    const row = rows[0];
    let sequence = row.current_sequence + 1;
    let lastResetAt = row.last_reset_at;
    const now = new Date();

    if (row.reset_period === 'yearly') {
      const lastYear = lastResetAt?.getUTCFullYear();
      if (lastYear !== now.getUTCFullYear()) {
        sequence = 1;
        lastResetAt = now;
      }
    } else if (row.reset_period === 'monthly') {
      const sameMonth =
        lastResetAt &&
        lastResetAt.getUTCFullYear() === now.getUTCFullYear() &&
        lastResetAt.getUTCMonth() === now.getUTCMonth();
      if (!sameMonth) {
        sequence = 1;
        lastResetAt = now;
      }
    }

    await client.numberingScheme.update({
      where: { id: row.id },
      data: {
        currentSequence: sequence,
        lastResetAt,
      },
    });

    return `${row.prefix}${String(sequence).padStart(row.padding, '0')}`;
  }
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    userId?: string;
    module?: string;
    entityName?: string;
    action?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);
    const where: Prisma.AuditLogWhereInput = {};
    if (query.userId) where.userId = query.userId;
    if (query.module) where.module = query.module;
    if (query.entityName) where.entityName = query.entityName;
    if (query.action) where.action = query.action;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = query.from;
      if (query.to) where.createdAt.lte = query.to;
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, page, pageSize, total };
  }

  async forEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityName: entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async loginActivity(query: {
    username?: string;
    outcome?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);
    const where: Prisma.LoginActivityWhereInput = {};
    if (query.username) {
      where.usernameAttempted = {
        contains: query.username,
        mode: 'insensitive',
      };
    }
    if (query.outcome) {
      where.outcome = query.outcome as never;
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.loginActivity.count({ where }),
      this.prisma.loginActivity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, page, pageSize, total };
  }
}
