import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminModule } from '../admin/admin.module';
import { AccountsModule } from '../accounts/accounts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { VendorController } from './controllers/vendor.controller';
import { PurchaseRequestController } from './controllers/purchase-request.controller';
import { PurchaseOrderController } from './controllers/purchase-order.controller';
import { GrnController } from './controllers/grn.controller';
import { VendorInvoiceController } from './controllers/vendor-invoice.controller';
import { VendorPaymentController } from './controllers/vendor-payment.controller';
import { VendorService } from './services/vendor.service';
import { PurchaseRequestService } from './services/purchase-request.service';
import { PrApprovalService } from './services/pr-approval.service';
import { PurchaseOrderService } from './services/purchase-order.service';
import { GrnService } from './services/grn.service';
import { VendorInvoiceService } from './services/vendor-invoice.service';
import { VendorPaymentService } from './services/vendor-payment.service';
import { PoDeliveryReminderJob } from './jobs/po-delivery-reminder.job';
import { InvoiceDueReminderJob } from './jobs/invoice-due-reminder.job';
import { VendorDocumentExpiryJob } from './jobs/vendor-document-expiry.job';
import { GrnClearingReviewJob } from './jobs/grn-clearing-review.job';
import { LowStockListener } from './listeners/low-stock.listener';

@Module({
  imports: [
    AdminModule,
    forwardRef(() => AccountsModule),
    forwardRef(() => InventoryModule),
    BullModule.registerQueue({ name: 'supply-chain' }),
  ],
  controllers: [
    VendorController,
    PurchaseRequestController,
    PurchaseOrderController,
    GrnController,
    VendorInvoiceController,
    VendorPaymentController,
  ],
  providers: [
    VendorService,
    PurchaseRequestService,
    PrApprovalService,
    PurchaseOrderService,
    GrnService,
    VendorInvoiceService,
    VendorPaymentService,
    PoDeliveryReminderJob,
    InvoiceDueReminderJob,
    VendorDocumentExpiryJob,
    GrnClearingReviewJob,
    LowStockListener,
  ],
  exports: [
    VendorService,
    PurchaseRequestService,
    PurchaseOrderService,
    GrnService,
    VendorInvoiceService,
    VendorPaymentService,
  ],
})
export class ProcurementModule {}
