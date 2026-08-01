import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrganizationService } from '../../admin/services/organization.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';
import { PurchaseRequestService } from '../services/purchase-request.service';

const AUTO_PR_MARKER = 'Auto-reorder (low stock)';

/** ST-10 — optional draft PR when stock crosses below minimum. */
@Injectable()
export class LowStockListener {
  private readonly logger = new Logger(LowStockListener.name);

  constructor(
    private readonly org: OrganizationService,
    private readonly prisma: PrismaService,
    private readonly prs: PurchaseRequestService,
  ) {}

  @OnEvent(EventNames.INVENTORY_STOCK_LOW)
  async handle(payload: {
    itemId: string;
    locationId: string;
    quantityOnHand: number;
    minimumStockLevel: number;
    source?: string;
  }) {
    const settings = await this.org.getFull();
    if (!settings.autoPrOnLowStockEnabled) return;

    const existing = await this.prisma.purchaseRequest.findFirst({
      where: {
        status: 'draft',
        justification: { contains: AUTO_PR_MARKER },
        lines: { some: { itemId: payload.itemId } },
      },
    });
    if (existing) {
      this.logger.debug(
        `Skip duplicate auto-PR for item ${payload.itemId} (draft ${existing.prNumber})`,
      );
      return;
    }

    const item = await this.prisma.item.findFirst({
      where: { id: payload.itemId, deletedAt: null },
      include: { unitOfMeasure: true },
    });
    if (!item || item.itemNature !== 'consumable') return;

    const reorderQty = Math.max(
      1,
      Number(item.reorderQuantity) ||
        payload.minimumStockLevel - payload.quantityOnHand,
    );
    const unitCost = item.standardCost ?? 0;

    const requesterId = await this.resolveStoreKeeperId();
    await this.prs.create(
      {
        justification: `${AUTO_PR_MARKER}: ${item.name}`,
        lines: [
          {
            itemId: item.id,
            itemDescription: item.name,
            quantity: reorderQty,
            unitOfMeasureId: item.unitOfMeasureId,
            estimatedUnitCost: unitCost,
            remarks: `Location ${payload.locationId}`,
          },
        ],
      },
      requesterId,
    );

    this.logger.log(
      `Draft auto-PR created for ${item.itemCode} (qty ${reorderQty})`,
    );
  }

  private async resolveStoreKeeperId(): Promise<string> {
    const receptionist = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        roles: { some: { role: { name: 'receptionist' } } },
      },
      select: { id: true },
    });
    return receptionist?.id ?? '00000000-0000-4000-8000-000000000002';
  }
}
