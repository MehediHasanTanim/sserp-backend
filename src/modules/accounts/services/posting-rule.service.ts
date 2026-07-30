import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { TxClient } from '../../../shared/prisma/transaction.helper';

@Injectable()
export class PostingRuleService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.postingRule.findMany({
      where: { isActive: true },
      orderBy: [{ referenceType: 'asc' }, { variant: 'asc' }],
    });
  }

  async update(
    id: string,
    data: Partial<{
      debitAccountCode: string;
      creditAccountCode: string;
      costCenter: string;
      isActive: boolean;
      description: string;
    }>,
  ) {
    return this.prisma.postingRule.update({ where: { id }, data });
  }

  async resolve(
    referenceType: string,
    variant: string | undefined,
    tx?: TxClient,
  ) {
    const client = tx ?? this.prisma;
    const v = variant ?? '';
    let rule = await client.postingRule.findFirst({
      where: { referenceType, variant: v, isActive: true },
    });
    if (!rule && v !== '') {
      rule = await client.postingRule.findFirst({
        where: { referenceType, variant: '', isActive: true },
      });
    }
    if (!rule) {
      throw DomainException.withCode(
        ErrorCode.POSTING_RULE_MISSING,
        422,
        `No posting rule for ${referenceType}${v ? `/${v}` : ''}`,
      );
    }
    return rule;
  }
}
