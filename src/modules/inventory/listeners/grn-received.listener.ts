import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';
import { StockLevelService } from '../services/stock-level.service';

interface GrnReceivedEvent {
  grnId: string;
  locationId?: string;
  itemIds?: string[];
}

/**
 * Maintains derived low-stock projections after GRN posting (Phase 6 §7).
 * Primary stock updates happen in the GRN post transaction; this listener
 * recomputes levels for affected items and emits alerts when still below minimum.
 */
@Injectable()
export class GrnReceivedListener {
  private readonly logger = new Logger(GrnReceivedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockLevels: StockLevelService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(EventNames.INVENTORY_GRN_RECEIVED)
  async handle(payload: GrnReceivedEvent) {
    this.logger.debug(`GRN received projection refresh: ${payload.grnId}`);

    let itemIds = payload.itemIds ?? [];
    if (itemIds.length === 0) {
      const lines = await this.prisma.grnLine.findMany({
        where: { grnId: payload.grnId },
        select: { itemId: true },
      });
      itemIds = [...new Set(lines.map((l) => l.itemId))];
    }

    if (itemIds.length === 0) return;

    const levels = await this.prisma.stockLevel.findMany({
      where: {
        itemId: { in: itemIds },
        locationId: payload.locationId,
      },
      include: { item: true },
    });

    for (const level of levels) {
      const onHand = Number(level.quantityOnHand);
      const minimum = Number(level.item.minimumStockLevel);
      if (onHand < minimum) {
        await this.events.emitAsync(EventNames.INVENTORY_STOCK_LOW, {
          itemId: level.itemId,
          locationId: level.locationId,
          quantityOnHand: onHand,
          minimumStockLevel: minimum,
          source: 'grn_received_listener',
        });
      }
    }

    const lowCount = (await this.stockLevels.lowStock()).length;
    this.logger.log(
      `GRN ${payload.grnId}: refreshed projections; ${lowCount} low-stock rows org-wide`,
    );
  }
}
