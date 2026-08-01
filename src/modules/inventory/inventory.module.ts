import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminModule } from '../admin/admin.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoryController } from './controllers/category.controller';
import {
  UnitController,
  LocationController,
} from './controllers/location.controller';
import { ItemController } from './controllers/item.controller';
import { StockController } from './controllers/stock.controller';
import { StockIssueController } from './controllers/stock-issue.controller';
import { StockAdjustmentController } from './controllers/stock-adjustment.controller';
import {
  AssetController,
  AssetRegisterController,
} from './controllers/asset.controller';
import { AuditController } from './controllers/audit.controller';
import { ItemService } from './services/item.service';
import { StockMovementService } from './services/stock-movement.service';
import { StockLevelService } from './services/stock-level.service';
import {
  StockIssueService,
  StockAdjustmentService,
} from './services/stock-issue.service';
import { AssetService } from './services/asset.service';
import { InventoryAuditService } from './services/inventory-audit.service';
import { GrnReceivedListener } from './listeners/grn-received.listener';
import { LowStockCheckJob } from './jobs/low-stock-check.job';
import { ExpiryAlertJob } from './jobs/expiry-alert.job';
import { MonthlyDepreciationJob } from './jobs/monthly-depreciation.job';
import { AuditScheduleJob } from './jobs/audit-schedule.job';

@Module({
  imports: [
    AdminModule,
    forwardRef(() => AccountsModule),
    BullModule.registerQueue({ name: 'supply-chain' }),
  ],
  controllers: [
    CategoryController,
    UnitController,
    LocationController,
    ItemController,
    StockController,
    StockIssueController,
    StockAdjustmentController,
    AssetController,
    AssetRegisterController,
    AuditController,
  ],
  providers: [
    ItemService,
    StockMovementService,
    StockLevelService,
    StockIssueService,
    StockAdjustmentService,
    AssetService,
    InventoryAuditService,
    GrnReceivedListener,
    LowStockCheckJob,
    ExpiryAlertJob,
    MonthlyDepreciationJob,
    AuditScheduleJob,
  ],
  exports: [StockMovementService, ItemService, AssetService, StockLevelService],
})
export class InventoryModule {}
