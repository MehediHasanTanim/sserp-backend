import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventNames } from '../../../shared/events/event-names';
import { StockLevelService } from '../services/stock-level.service';

@Injectable()
export class LowStockCheckJob {
  private readonly logger = new Logger(LowStockCheckJob.name);

  constructor(
    private readonly stockLevels: StockLevelService,
    private readonly events: EventEmitter2,
    @InjectQueue('supply-chain') private readonly queue: Queue,
  ) {}

  @Cron('30 6 * * *')
  async handle() {
    this.logger.log('Running daily low-stock check');
    await this.queue.add('low-stock-check', {}, { removeOnComplete: 100 });
    const low = await this.stockLevels.lowStock();
    for (const level of low) {
      await this.events.emitAsync(EventNames.INVENTORY_STOCK_LOW, {
        itemId: level.itemId,
        locationId: level.locationId,
        quantityOnHand: Number(level.quantityOnHand),
        minimumStockLevel: Number(level.item.minimumStockLevel),
        source: 'low_stock_check_job',
      });
    }
    this.logger.log(
      `Low-stock check complete: ${low.length} items below minimum`,
    );
  }
}
