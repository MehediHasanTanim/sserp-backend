import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { LedgerPort } from '../../../shared/ports/ledger.port';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import { NumberingService } from '../../admin/services/organization.service';
import { AccountsService } from '../../accounts/services/accounts.service';
import { DepreciationService } from './depreciation.service';

@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);
  private readonly depreciation = new DepreciationService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly ledger: LedgerPort,
    private readonly accounts: AccountsService,
    private readonly events: EventEmitter2,
  ) {}

  list(filters?: { status?: string; itemId?: string }) {
    return this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        status: filters?.status as never,
        itemId: filters?.itemId,
      },
      include: { item: true, currentLocation: true },
      orderBy: { assetCode: 'asc' },
    });
  }

  async get(id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, deletedAt: null },
      include: {
        item: { include: { category: true } },
        currentLocation: true,
        assignments: { orderBy: { assignedFrom: 'desc' }, take: 10 },
        conditionLogs: { orderBy: { loggedAt: 'desc' }, take: 10 },
        depreciationEntries: {
          orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
        },
        disposals: true,
      },
    });
    if (!asset) throw DomainException.notFound('Asset not found');
    return asset;
  }

  async create(data: {
    itemId: string;
    name: string;
    serialNumber?: string;
    purchaseDate: string;
    purchaseCost: number;
    supplierVendorId?: string;
    grnId?: string;
    warrantyExpiryDate?: string;
    usefulLifeMonths?: number;
    salvageValue?: number;
    depreciationMethod: 'straight_line' | 'reducing_balance';
    depreciationRatePercent?: number;
    currentLocationId?: string;
    coaAssetAccountCode?: string;
  }) {
    const item = await this.prisma.item.findFirst({
      where: { id: data.itemId, deletedAt: null },
      include: { category: true },
    });
    if (!item) throw DomainException.notFound('Item not found');

    const assetCode = await this.numbering.nextCode('asset');
    return this.prisma.asset.create({
      data: {
        assetCode,
        itemId: data.itemId,
        name: data.name,
        serialNumber: data.serialNumber,
        purchaseDate: new Date(data.purchaseDate),
        purchaseCost: data.purchaseCost,
        supplierVendorId: data.supplierVendorId,
        grnId: data.grnId,
        warrantyExpiryDate: data.warrantyExpiryDate
          ? new Date(data.warrantyExpiryDate)
          : undefined,
        usefulLifeMonths: data.usefulLifeMonths,
        salvageValue: data.salvageValue ?? 0,
        depreciationMethod: data.depreciationMethod,
        depreciationRatePercent: data.depreciationRatePercent,
        accumulatedDepreciation: 0,
        netBookValue: data.purchaseCost,
        condition: 'new',
        status: 'in_store',
        currentLocationId: data.currentLocationId,
        coaAssetAccountCode:
          data.coaAssetAccountCode ??
          item.category.defaultCoaAssetCode ??
          '1510',
      },
      include: { item: true },
    });
  }

  async createFromGrn(
    input: {
      itemId: string;
      name: string;
      serialNumber?: string;
      purchaseDate: string;
      purchaseCost: number;
      grnId: string;
      supplierVendorId?: string;
      locationId?: string;
      usefulLifeMonths?: number;
      salvageValue?: number;
      depreciationMethod?: 'straight_line' | 'reducing_balance';
      depreciationRatePercent?: number;
    },
    tx?: TxClient,
  ) {
    const run = async (client: TxClient) => {
      const item = await client.item.findFirst({
        where: { id: input.itemId, deletedAt: null },
        include: { category: true },
      });
      if (!item) throw DomainException.notFound('Item not found');
      if (item.itemNature !== 'asset') {
        throw DomainException.validation(
          'Item must be asset nature for GRN asset creation',
        );
      }

      const assetCode = await this.numbering.nextCode('asset', client);
      return client.asset.create({
        data: {
          assetCode,
          itemId: input.itemId,
          name: input.name,
          serialNumber: input.serialNumber,
          purchaseDate: new Date(input.purchaseDate),
          purchaseCost: input.purchaseCost,
          supplierVendorId: input.supplierVendorId,
          grnId: input.grnId,
          usefulLifeMonths: input.usefulLifeMonths ?? 60,
          salvageValue: input.salvageValue ?? 0,
          depreciationMethod: input.depreciationMethod ?? 'straight_line',
          depreciationRatePercent: input.depreciationRatePercent,
          accumulatedDepreciation: 0,
          netBookValue: input.purchaseCost,
          condition: 'new',
          status: 'in_store',
          currentLocationId: input.locationId,
          coaAssetAccountCode: item.category.defaultCoaAssetCode ?? '1510',
        },
      });
    };
    if (tx) return run(tx);
    return this.prisma.$transaction((inner) => run(inner));
  }

  async update(id: string, data: Prisma.AssetUpdateInput) {
    const asset = await this.get(id);
    if (asset.status === 'disposed') {
      throw DomainException.withCode(
        ErrorCode.ASSET_DISPOSED,
        409,
        'Cannot update a disposed asset',
      );
    }
    return this.prisma.asset.update({ where: { id }, data });
  }

  async assign(
    id: string,
    data: {
      assignedToType: 'employee' | 'department' | 'room';
      assignedToId: string;
      assignedFrom: string;
      assignedToDate?: string;
      notes?: string;
      acknowledgementAttachmentId?: string;
    },
    actorId: string,
  ) {
    const asset = await this.get(id);
    if (asset.status === 'disposed') {
      throw DomainException.withCode(
        ErrorCode.ASSET_DISPOSED,
        409,
        'Cannot assign a disposed asset',
      );
    }
    if (asset.status === 'assigned') {
      throw DomainException.withCode(
        ErrorCode.ASSET_ALREADY_ASSIGNED,
        409,
        'Asset is already assigned; return it first',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assetAssignment.create({
        data: {
          assetId: id,
          assignedToType: data.assignedToType,
          assignedToId: data.assignedToId,
          assignedFrom: new Date(data.assignedFrom),
          assignedToDate: data.assignedToDate
            ? new Date(data.assignedToDate)
            : undefined,
          assignedBy: actorId,
          notes: data.notes,
          acknowledgementAttachmentId: data.acknowledgementAttachmentId,
        },
      });
      const updated = await tx.asset.update({
        where: { id },
        data: {
          status: 'assigned',
          currentAssigneeEmployeeId:
            data.assignedToType === 'employee' ? data.assignedToId : null,
        },
      });
      await this.events.emitAsync(EventNames.ASSET_ASSIGNED, {
        assetId: id,
        assignmentId: assignment.id,
        assignedToType: data.assignedToType,
        assignedToId: data.assignedToId,
        actorId,
      });
      return { asset: updated, assignment };
    });
  }

  async returnAsset(
    id: string,
    data: {
      returnCondition: 'new' | 'good' | 'fair' | 'damaged' | 'scrapped';
      notes?: string;
    },
    actorId: string,
  ) {
    const asset = await this.get(id);
    if (asset.status !== 'assigned') {
      throw DomainException.conflict('Asset is not currently assigned');
    }

    const openAssignment = await this.prisma.assetAssignment.findFirst({
      where: { assetId: id, returnedAt: null },
      orderBy: { assignedFrom: 'desc' },
    });
    if (!openAssignment) {
      throw DomainException.conflict('No open assignment found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.assetAssignment.update({
        where: { id: openAssignment.id },
        data: {
          returnedAt: new Date(),
          returnCondition: data.returnCondition,
          notes: data.notes ?? openAssignment.notes,
        },
      });
      return tx.asset.update({
        where: { id },
        data: {
          status: 'in_store',
          condition: data.returnCondition,
          currentAssigneeEmployeeId: null,
        },
      });
    });
  }

  async logCondition(
    id: string,
    data: {
      condition: 'new' | 'good' | 'fair' | 'damaged' | 'scrapped';
      notes?: string;
      attachmentId?: string;
    },
    actorId: string,
  ) {
    const asset = await this.get(id);
    if (asset.status === 'disposed') {
      throw DomainException.withCode(
        ErrorCode.ASSET_DISPOSED,
        409,
        'Cannot log condition on a disposed asset',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.assetConditionLog.create({
        data: {
          assetId: id,
          loggedAt: new Date(),
          condition: data.condition,
          notes: data.notes,
          attachmentId: data.attachmentId,
          loggedBy: actorId,
        },
      });
      return tx.asset.update({
        where: { id },
        data: { condition: data.condition },
      });
    });
  }

  listDepreciation(assetId: string) {
    return this.prisma.assetDepreciationEntry.findMany({
      where: { assetId },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
  }

  assetRegister() {
    return this.prisma.asset.findMany({
      where: { deletedAt: null, status: { not: 'disposed' } },
      include: { item: true, currentLocation: true },
      orderBy: { assetCode: 'asc' },
    });
  }

  /**
   * Monthly depreciation run (AS-03/04). Idempotent per (asset, year, month).
   */
  async runDepreciation(year: number, month: number) {
    const assets = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['disposed', 'lost'] },
      },
    });

    let processed = 0;
    for (const asset of assets) {
      const existing = await this.prisma.assetDepreciationEntry.findUnique({
        where: {
          assetId_periodYear_periodMonth: {
            assetId: asset.id,
            periodYear: year,
            periodMonth: month,
          },
        },
      });
      if (existing) continue;

      const result = this.depreciation.computeMonthly({
        purchaseCost: asset.purchaseCost,
        salvageValue: asset.salvageValue,
        usefulLifeMonths: asset.usefulLifeMonths ?? 0,
        depreciationMethod: asset.depreciationMethod,
        depreciationRatePercent: asset.depreciationRatePercent
          ? Number(asset.depreciationRatePercent)
          : null,
        accumulatedDepreciation: asset.accumulatedDepreciation,
        netBookValue: asset.netBookValue,
        disposed: asset.status === 'disposed',
      });

      if (result.skipped || result.depreciationAmount === 0) continue;

      await this.prisma.$transaction(async (tx) => {
        const entry = await tx.assetDepreciationEntry.create({
          data: {
            assetId: asset.id,
            periodMonth: month,
            periodYear: year,
            openingNbv: result.openingNbv,
            depreciationAmount: result.depreciationAmount,
            closingNbv: result.closingNbv,
            computedAt: new Date(),
          },
        });

        const posted = await this.ledger.post(
          {
            referenceType: 'asset_depreciation',
            referenceId: entry.id,
            amount: result.depreciationAmount,
            costCenter: 'admin',
            description: `Depreciation ${asset.assetCode} ${year}-${month}`,
            debitAccountCode: '',
            creditAccountCode: '',
            postingDate: new Date(Date.UTC(year, month - 1, 28)),
          },
          tx,
        );

        await tx.assetDepreciationEntry.update({
          where: { id: entry.id },
          data: { journalId: posted.journalId },
        });

        await tx.asset.update({
          where: { id: asset.id },
          data: {
            accumulatedDepreciation:
              asset.accumulatedDepreciation + result.depreciationAmount,
            netBookValue: result.closingNbv,
          },
        });
      });
      processed += 1;
    }

    this.logger.log(
      `Depreciation run ${year}-${month}: ${processed} assets posted`,
    );
    return { year, month, processed };
  }

  async dispose(
    id: string,
    data: {
      disposalDate: string;
      disposalType: 'sale' | 'scrap' | 'donation' | 'write_off' | 'lost';
      proceedsAmount?: number;
      reason: string;
      attachmentId?: string;
    },
    actorId: string,
  ) {
    if (!data.reason?.trim()) {
      throw DomainException.validation('Disposal reason is mandatory');
    }

    const asset = await this.get(id);
    if (asset.status === 'disposed') {
      throw DomainException.withCode(
        ErrorCode.ASSET_DISPOSED,
        409,
        'Asset is already disposed',
      );
    }

    const proceeds = data.proceedsAmount ?? 0;
    const nbv = asset.netBookValue;
    const gainLoss = proceeds - nbv;
    const assetAccount =
      asset.coaAssetAccountCode ??
      asset.item.category.defaultCoaAssetCode ??
      '1510';

    return this.prisma.$transaction(async (tx) => {
      const accounts = await this.loadAccountIds(
        ['1520', assetAccount, '1120', '4090', '5055'],
        tx,
      );

      const lines: Array<{
        accountId: string;
        debitAmount: number;
        creditAmount: number;
        costCenter?: string;
        narration?: string;
      }> = [];

      if (asset.accumulatedDepreciation > 0) {
        lines.push({
          accountId: accounts['1520'],
          debitAmount: asset.accumulatedDepreciation,
          creditAmount: 0,
          costCenter: 'admin',
          narration: 'Remove accumulated depreciation',
        });
      }
      if (proceeds > 0) {
        lines.push({
          accountId: accounts['1120'],
          debitAmount: proceeds,
          creditAmount: 0,
          costCenter: 'admin',
          narration: 'Disposal proceeds',
        });
      }
      if (gainLoss < 0) {
        lines.push({
          accountId: accounts['5055'],
          debitAmount: -gainLoss,
          creditAmount: 0,
          costCenter: 'admin',
          narration: 'Loss on disposal',
        });
      }
      lines.push({
        accountId: accounts[assetAccount],
        debitAmount: 0,
        creditAmount: asset.purchaseCost,
        costCenter: 'admin',
        narration: 'Remove asset cost',
      });
      if (gainLoss > 0) {
        lines.push({
          accountId: accounts['4090'],
          debitAmount: 0,
          creditAmount: gainLoss,
          costCenter: 'admin',
          narration: 'Gain on disposal',
        });
      }

      const journal = await this.accounts.createPostedJournal(
        {
          entryDate: new Date(data.disposalDate),
          entryType: 'system',
          description: `Asset disposal ${asset.assetCode}`,
          costCenter: 'admin',
          referenceType: 'asset_disposal',
          referenceId: id,
          idempotencyReference: `asset_disposal:${id}`,
          postedBy: actorId,
          skipBudgetCheck: true,
          lines,
        },
        tx,
      );

      const disposal = await tx.assetDisposal.create({
        data: {
          assetId: id,
          disposalDate: new Date(data.disposalDate),
          disposalType: data.disposalType,
          proceedsAmount: proceeds,
          netBookValueAtDisposal: nbv,
          gainLossAmount: gainLoss,
          reason: data.reason,
          approvedBy: actorId,
          journalId: journal.id,
          attachmentId: data.attachmentId,
        },
      });

      await tx.asset.update({
        where: { id },
        data: {
          status: 'disposed',
          netBookValue: 0,
          currentAssigneeEmployeeId: null,
        },
      });

      await this.events.emitAsync(EventNames.ASSET_DISPOSED, {
        assetId: id,
        disposalId: disposal.id,
        gainLossAmount: gainLoss,
        actorId,
      });

      return disposal;
    });
  }

  private async loadAccountIds(codes: string[], tx: TxClient) {
    const unique = [...new Set(codes)];
    const rows = await tx.chartOfAccount.findMany({
      where: { accountCode: { in: unique } },
    });
    const map: Record<string, string> = {};
    for (const row of rows) map[row.accountCode] = row.id;
    for (const code of unique) {
      if (!map[code]) {
        throw DomainException.withCode(
          ErrorCode.INVALID_ACCOUNT,
          422,
          `Missing chart account ${code}`,
        );
      }
    }
    return map;
  }
}
