import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DiscrepancyType, InventoryAuditStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { StockAdjustmentService } from './stock-issue.service';

export interface AuditLineSnapshot {
  id: string;
  physicalQuantity: number | null;
  systemQuantity: number;
  unitCost: number;
  discrepancyType: DiscrepancyType | null;
  explanation: string | null;
}

export interface CorrectiveActionSnapshot {
  auditLineId: string;
  status: string;
}

/** IA-04 discrepancy classification. */
export function classifyAuditDiscrepancy(
  systemQuantity: number,
  physicalQuantity: number,
  unitCost: number,
): {
  differenceQuantity: number;
  differenceValue: number;
  discrepancyType: DiscrepancyType;
} {
  const differenceQuantity = physicalQuantity - systemQuantity;
  let discrepancyType: DiscrepancyType = 'match';
  if (differenceQuantity > 1e-9) discrepancyType = 'surplus';
  else if (differenceQuantity < -1e-9) discrepancyType = 'shortage';

  return {
    differenceQuantity,
    differenceValue: Math.round(differenceQuantity * unitCost),
    discrepancyType,
  };
}

/** IA-03 — every line must have a physical count before submit. */
export function validateAuditSubmit(lines: AuditLineSnapshot[]): {
  ok: boolean;
  missingCount: number;
} {
  const missingCount = lines.filter((l) => l.physicalQuantity == null).length;
  return { ok: missingCount === 0, missingCount };
}

/** IA-06 / IA-07 sign-off validation. */
export function validateAuditSignOff(input: {
  status: InventoryAuditStatus;
  lines: AuditLineSnapshot[];
  correctiveActions: CorrectiveActionSnapshot[];
}): { ok: boolean; code?: ErrorCode; message?: string } {
  if (input.status === 'signed_off') {
    return {
      ok: false,
      code: ErrorCode.AUDIT_SIGNED_OFF,
      message: 'Audit is already signed off',
    };
  }
  if (input.status !== 'counted' && input.status !== 'reviewed') {
    return {
      ok: false,
      code: ErrorCode.INVALID_STATUS_TRANSITION,
      message: 'Audit must be counted or reviewed before sign-off',
    };
  }

  const shortages = input.lines.filter((l) => l.discrepancyType === 'shortage');
  for (const line of shortages) {
    const hasExplanation = Boolean(line.explanation?.trim());
    const hasAction = input.correctiveActions.some(
      (a) => a.auditLineId === line.id && a.status !== 'waived',
    );
    if (!hasExplanation && !hasAction) {
      return {
        ok: false,
        code: ErrorCode.EXPLANATION_REQUIRED,
        message: 'Shortage lines require an explanation or corrective action',
      };
    }
  }

  return { ok: true };
}

@Injectable()
export class InventoryAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly adjustments: StockAdjustmentService,
    private readonly events: EventEmitter2,
  ) {}

  list(filters?: { status?: InventoryAuditStatus }) {
    return this.prisma.inventoryAudit.findMany({
      where: { status: filters?.status },
      orderBy: { scheduledDate: 'desc' },
    });
  }

  history() {
    return this.prisma.inventoryAudit.findMany({
      where: { status: { in: ['signed_off', 'cancelled'] } },
      orderBy: { signedOffAt: 'desc' },
    });
  }

  async get(id: string) {
    const audit = await this.prisma.inventoryAudit.findUnique({
      where: { id },
      include: {
        lines: { include: { item: true, location: true } },
        correctiveActions: true,
      },
    });
    if (!audit) throw DomainException.notFound('Audit not found');
    return audit;
  }

  async create(data: {
    auditType: 'half_yearly' | 'ad_hoc' | 'cycle_count';
    periodLabel: string;
    scheduledDate: string;
    locationIds: string[];
    categoryIds: string[];
    notes?: string;
  }) {
    const auditNumber = await this.numbering.nextCode('inventory_audit');
    const audit = await this.prisma.inventoryAudit.create({
      data: {
        auditNumber,
        auditType: data.auditType,
        periodLabel: data.periodLabel,
        scheduledDate: new Date(data.scheduledDate),
        locationIds: data.locationIds,
        categoryIds: data.categoryIds,
        status: 'scheduled',
        notes: data.notes,
      },
    });
    await this.events.emitAsync(EventNames.INVENTORY_AUDIT_SCHEDULED, {
      auditId: audit.id,
      auditNumber,
    });
    return audit;
  }

  /** IA-02 — freeze system quantities from stock_levels. */
  async start(id: string, actorId: string) {
    const audit = await this.get(id);
    if (audit.status !== 'scheduled') {
      throw DomainException.conflict('Audit must be scheduled to start');
    }

    const levels = await this.prisma.stockLevel.findMany({
      where: {
        locationId: { in: audit.locationIds },
        item: {
          deletedAt: null,
          isActive: true,
          categoryId: audit.categoryIds.length
            ? { in: audit.categoryIds }
            : undefined,
        },
      },
      include: { item: true },
    });

    return this.prisma.$transaction(async (tx) => {
      if (levels.length > 0) {
        await tx.inventoryAuditLine.createMany({
          data: levels.map((l) => ({
            auditId: id,
            itemId: l.itemId,
            locationId: l.locationId,
            systemQuantity: l.quantityOnHand,
            unitCost: l.averageCost,
          })),
        });
      }
      return tx.inventoryAudit.update({
        where: { id },
        data: {
          status: 'in_progress',
          startedAt: new Date(),
          countedBy: actorId,
        },
        include: { lines: true },
      });
    });
  }

  checklist(id: string) {
    return this.prisma.inventoryAuditLine.findMany({
      where: { auditId: id },
      include: { item: { include: { category: true } }, location: true },
      orderBy: [{ locationId: 'asc' }, { itemId: 'asc' }],
    });
  }

  async patchLines(
    id: string,
    lines: Array<{
      lineId: string;
      physicalQuantity: number;
      explanation?: string;
    }>,
    actorId: string,
  ) {
    const audit = await this.get(id);
    if (audit.status === 'signed_off') {
      throw DomainException.withCode(
        ErrorCode.AUDIT_SIGNED_OFF,
        409,
        'Signed-off audit is immutable',
      );
    }
    if (audit.status !== 'in_progress' && audit.status !== 'counted') {
      throw DomainException.conflict('Audit is not open for counting');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const patch of lines) {
        const line = audit.lines.find((l) => l.id === patch.lineId);
        if (!line)
          throw DomainException.notFound(
            `Audit line ${patch.lineId} not found`,
          );

        const classified = classifyAuditDiscrepancy(
          Number(line.systemQuantity),
          patch.physicalQuantity,
          line.unitCost,
        );

        await tx.inventoryAuditLine.update({
          where: { id: patch.lineId },
          data: {
            physicalQuantity: patch.physicalQuantity,
            differenceQuantity: classified.differenceQuantity,
            differenceValue: classified.differenceValue,
            discrepancyType: classified.discrepancyType,
            explanation: patch.explanation,
            countedBy: actorId,
            countedAt: new Date(),
          },
        });
      }
    });

    return this.get(id);
  }

  /** IA-03/04 — move to counted and aggregate discrepancies. */
  async submit(id: string, actorId: string) {
    const audit = await this.get(id);
    if (audit.status === 'signed_off') {
      throw DomainException.withCode(
        ErrorCode.AUDIT_SIGNED_OFF,
        409,
        'Signed-off audit is immutable',
      );
    }

    const snapshots: AuditLineSnapshot[] = audit.lines.map((l) => ({
      id: l.id,
      physicalQuantity:
        l.physicalQuantity != null ? Number(l.physicalQuantity) : null,
      systemQuantity: Number(l.systemQuantity),
      unitCost: l.unitCost,
      discrepancyType: l.discrepancyType,
      explanation: l.explanation,
    }));

    const submitCheck = validateAuditSubmit(snapshots);
    if (!submitCheck.ok) {
      throw DomainException.withCode(
        ErrorCode.AUDIT_INCOMPLETE,
        422,
        'Physical count required for every audit line',
        { missingCount: submitCheck.missingCount },
      );
    }

    let discrepancyCount = 0;
    let netDiscrepancyValue = 0;
    for (const line of audit.lines) {
      const physical = Number(line.physicalQuantity);
      const classified = classifyAuditDiscrepancy(
        Number(line.systemQuantity),
        physical,
        line.unitCost,
      );
      if (classified.discrepancyType !== 'match') discrepancyCount += 1;
      netDiscrepancyValue += classified.differenceValue;

      await this.prisma.inventoryAuditLine.update({
        where: { id: line.id },
        data: {
          differenceQuantity: classified.differenceQuantity,
          differenceValue: classified.differenceValue,
          discrepancyType: classified.discrepancyType,
        },
      });
    }

    const nextStatus: InventoryAuditStatus =
      discrepancyCount === 0 ? 'reviewed' : 'counted';

    return this.prisma.inventoryAudit.update({
      where: { id },
      data: {
        status: nextStatus,
        reviewedBy: discrepancyCount === 0 ? actorId : undefined,
        discrepancyCount,
        netDiscrepancyValue,
      },
      include: { lines: true },
    });
  }

  discrepancies(id: string) {
    return this.prisma.inventoryAuditLine.findMany({
      where: {
        auditId: id,
        discrepancyType: { in: ['surplus', 'shortage'] },
      },
      include: { item: true, location: true, correctiveActions: true },
      orderBy: { differenceValue: 'asc' },
    });
  }

  /** IA-05 — generate stock adjustments from discrepancies. */
  async createAdjustments(id: string, actorId: string) {
    const audit = await this.get(id);
    if (audit.status === 'signed_off') {
      throw DomainException.withCode(
        ErrorCode.AUDIT_SIGNED_OFF,
        409,
        'Signed-off audit is immutable',
      );
    }
    if (audit.status !== 'counted' && audit.status !== 'reviewed') {
      throw DomainException.conflict(
        'Audit must be counted before adjustments',
      );
    }

    const discrepancyLines = audit.lines.filter(
      (l) =>
        l.discrepancyType === 'surplus' || l.discrepancyType === 'shortage',
    );
    if (discrepancyLines.length === 0) {
      await this.prisma.inventoryAudit.update({
        where: { id },
        data: { status: 'reviewed', reviewedBy: actorId },
      });
      return { adjustments: [], auditId: id };
    }

    const increases = discrepancyLines.filter(
      (l) => l.discrepancyType === 'surplus',
    );
    const decreases = discrepancyLines.filter(
      (l) => l.discrepancyType === 'shortage',
    );
    const created = [];

    for (const [type, lines] of [
      ['increase', increases],
      ['decrease', decreases],
    ] as const) {
      if (lines.length === 0) continue;
      const byLocation = new Map<string, typeof lines>();
      for (const line of lines) {
        const bucket = byLocation.get(line.locationId) ?? [];
        bucket.push(line);
        byLocation.set(line.locationId, bucket);
      }
      for (const [locationId, group] of byLocation) {
        const adj = await this.adjustments.create({
          locationId,
          adjustmentDate: new Date().toISOString().slice(0, 10),
          reason: `Inventory audit ${audit.auditNumber} reconciliation`,
          adjustmentType: type,
          auditId: id,
          lines: group.map((l) => ({
            itemId: l.itemId,
            systemQuantity: Number(l.systemQuantity),
            adjustedQuantity: Number(l.physicalQuantity),
            unitCost: l.unitCost,
            remarks: l.explanation ?? undefined,
          })),
        });
        created.push(adj);
      }
    }

    await this.prisma.inventoryAudit.update({
      where: { id },
      data: { status: 'reviewed', reviewedBy: actorId },
    });

    return { adjustments: created, auditId: id };
  }

  /** IA-06/07 — principal sign-off. */
  async signOff(id: string, actorId: string) {
    const audit = await this.get(id);
    const validation = validateAuditSignOff({
      status: audit.status,
      lines: audit.lines.map((l) => ({
        id: l.id,
        physicalQuantity:
          l.physicalQuantity != null ? Number(l.physicalQuantity) : null,
        systemQuantity: Number(l.systemQuantity),
        unitCost: l.unitCost,
        discrepancyType: l.discrepancyType,
        explanation: l.explanation,
      })),
      correctiveActions: audit.correctiveActions.map((a) => ({
        auditLineId: a.auditLineId,
        status: a.status,
      })),
    });

    if (!validation.ok) {
      throw DomainException.withCode(
        validation.code ?? ErrorCode.UNPROCESSABLE,
        validation.code === ErrorCode.AUDIT_SIGNED_OFF ? 409 : 422,
        validation.message ?? 'Cannot sign off audit',
      );
    }

    const signed = await this.prisma.inventoryAudit.update({
      where: { id },
      data: {
        status: 'signed_off',
        signedOffBy: actorId,
        signedOffAt: new Date(),
      },
    });

    await this.events.emitAsync(EventNames.INVENTORY_AUDIT_SIGNED_OFF, {
      auditId: id,
      actorId,
    });

    return signed;
  }

  listCorrectiveActions(auditId: string) {
    return this.prisma.auditCorrectiveAction.findMany({
      where: { auditId },
      include: { auditLine: { include: { item: true } } },
      orderBy: { dueDate: 'asc' },
    });
  }

  createCorrectiveAction(
    auditId: string,
    data: {
      auditLineId: string;
      actionDescription: string;
      responsibleUserId: string;
      dueDate: string;
    },
  ) {
    return this.prisma.auditCorrectiveAction.create({
      data: {
        auditId,
        auditLineId: data.auditLineId,
        actionDescription: data.actionDescription,
        responsibleUserId: data.responsibleUserId,
        dueDate: new Date(data.dueDate),
        status: 'open',
      },
    });
  }

  updateCorrectiveAction(
    id: string,
    data: {
      status?: 'open' | 'in_progress' | 'completed' | 'waived';
      outcomeNotes?: string;
    },
  ) {
    return this.prisma.auditCorrectiveAction.update({
      where: { id },
      data: {
        status: data.status,
        outcomeNotes: data.outcomeNotes,
        completedAt: data.status === 'completed' ? new Date() : undefined,
      },
    });
  }

  /** IA-01 helper — schedule half-yearly audit if missing. */
  async ensureHalfYearlyAudit(half: 'H1' | 'H2', year: number) {
    const periodLabel = `${half} ${year}`;
    const existing = await this.prisma.inventoryAudit.findFirst({
      where: { periodLabel, auditType: 'half_yearly' },
    });
    if (existing) return existing;

    const locations = await this.prisma.location.findMany({
      where: { isActive: true, locationType: 'store' },
      select: { id: true },
    });
    const categories = await this.prisma.itemCategory.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const scheduledDate =
      half === 'H1'
        ? new Date(Date.UTC(year, 5, 30))
        : new Date(Date.UTC(year, 11, 31));

    return this.create({
      auditType: 'half_yearly',
      periodLabel,
      scheduledDate: scheduledDate.toISOString().slice(0, 10),
      locationIds: locations.map((l) => l.id),
      categoryIds: categories.map((c) => c.id),
      notes: `Auto-scheduled ${periodLabel} inventory audit`,
    });
  }
}
