import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventNames } from '../../../shared/events/event-names';
import { StockLevelService } from '../services/stock-level.service';

@Injectable()
export class ExpiryAlertJob {
  private readonly logger = new Logger(ExpiryAlertJob.name);

  constructor(
    private readonly stockLevels: StockLevelService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('45 6 * * *')
  async handle() {
    this.logger.log('Running expiry alert job');
    for (const withinDays of [30, 7]) {
      const batches = await this.stockLevels.expiring(withinDays);
      for (const batch of batches) {
        await this.events.emitAsync(EventNames.INVENTORY_STOCK_EXPIRING, {
          batchId: batch.id,
          itemId: batch.itemId,
          locationId: batch.locationId,
          expiryDate: batch.expiryDate,
          remainingQuantity: Number(batch.remainingQuantity),
          withinDays,
        });
      }
    }
  }
}
