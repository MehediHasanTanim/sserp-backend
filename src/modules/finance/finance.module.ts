import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import {
  ShareholderService,
  ReserveService,
  ProfitAppropriationService,
  DisbursementService,
} from './services/shareholder.service';
import {
  ShareholderController,
  ReserveController,
  AppropriationController,
  DisbursementController,
} from './controllers/finance.controller';

@Module({
  imports: [AdminModule],
  controllers: [
    ShareholderController,
    ReserveController,
    AppropriationController,
    DisbursementController,
  ],
  providers: [
    ShareholderService,
    ReserveService,
    ProfitAppropriationService,
    DisbursementService,
  ],
  exports: [
    ShareholderService,
    ProfitAppropriationService,
    DisbursementService,
  ],
})
export class FinanceModule {}
