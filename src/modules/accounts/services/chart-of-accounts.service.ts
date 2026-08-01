import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';

export interface CreateAccountDto {
  accountCode: string;
  accountName: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parentId?: string;
  isGroup?: boolean;
  normalBalance: 'debit' | 'credit';
  allowManualPosting?: boolean;
  costCenter?: string;
  openingBalance?: number;
  openingBalanceDate?: Date;
}

@Injectable()
export class ChartOfAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(flat = false) {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { isActive: true },
      orderBy: { accountCode: 'asc' },
    });
    if (flat) return accounts;
    return this.buildTree(accounts);
  }

  async findById(id: string) {
    const account = await this.prisma.chartOfAccount.findUnique({
      where: { id },
    });
    if (!account) throw DomainException.notFound('Account not found');
    return account;
  }

  async findByCode(code: string) {
    const account = await this.prisma.chartOfAccount.findUnique({
      where: { accountCode: code },
    });
    if (!account) throw DomainException.notFound(`Account ${code} not found`);
    return account;
  }

  async create(dto: CreateAccountDto) {
    let level = 1;
    let path = dto.accountCode;
    if (dto.parentId) {
      const parent = await this.findById(dto.parentId);
      if (!parent.isGroup) {
        throw DomainException.validation('Parent must be a group account');
      }
      level = parent.level + 1;
      path = `${parent.path}.${dto.accountCode}`;
    }

    try {
      return await this.prisma.chartOfAccount.create({
        data: {
          accountCode: dto.accountCode,
          accountName: dto.accountName,
          accountType: dto.accountType,
          parentId: dto.parentId,
          level,
          path,
          isGroup: dto.isGroup ?? false,
          normalBalance: dto.normalBalance,
          allowManualPosting: dto.allowManualPosting ?? true,
          costCenter: dto.costCenter,
          openingBalance: dto.openingBalance ?? 0,
          openingBalanceDate: dto.openingBalanceDate,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw DomainException.conflict('Account code already exists');
      throw e;
    }
  }

  async update(id: string, data: Partial<CreateAccountDto>) {
    await this.findById(id);
    return this.prisma.chartOfAccount.update({
      where: { id },
      data: {
        accountName: data.accountName,
        allowManualPosting: data.allowManualPosting,
        costCenter: data.costCenter,
        isGroup: data.isGroup,
      },
    });
  }

  async deactivate(id: string) {
    await this.findById(id);
    return this.prisma.chartOfAccount.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private buildTree(
    accounts: Array<{
      id: string;
      parentId: string | null;
      [k: string]: unknown;
    }>,
  ) {
    const byParent = new Map<string | null, typeof accounts>();
    for (const a of accounts) {
      const key = a.parentId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(a);
    }
    const walk = (parentId: string | null): any[] =>
      (byParent.get(parentId) ?? []).map((a) => ({
        ...a,
        children: walk(a.id),
      }));
    return walk(null);
  }
}
