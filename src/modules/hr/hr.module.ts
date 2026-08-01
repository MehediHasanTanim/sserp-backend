import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminModule } from '../admin/admin.module';
import { AccountsModule } from '../accounts/accounts.module';
import { EmployeeController } from './controllers/employee.controller';
import { EmployeeDocumentController } from './controllers/employee-document.controller';
import { HrAttendanceController } from './controllers/hr-attendance.controller';
import { LeaveTypeController } from './controllers/leave-type.controller';
import { LeaveRequestController } from './controllers/leave-request.controller';
import { LeaveBalanceController } from './controllers/leave-balance.controller';
import { HolidayController } from './controllers/holiday.controller';
import { SalaryComponentController } from './controllers/salary-component.controller';
import { SalaryStructureController } from './controllers/salary-structure.controller';
import { PayrollController } from './controllers/payroll.controller';
import { PayslipController } from './controllers/payslip.controller';
import { BonusController } from './controllers/bonus.controller';
import { GratuityPolicyController } from './controllers/gratuity-policy.controller';
import { GratuityController } from './controllers/gratuity.controller';
import { EncashmentController } from './controllers/encashment.controller';
import { PerformanceController } from './controllers/performance.controller';
import { RecruitmentController } from './controllers/recruitment.controller';
import { TrainingController } from './controllers/training.controller';
import { BenefitsController } from './controllers/benefits.controller';
import { HrEmployeeReadService } from './services/hr-employee-read.service';
import { EmployeeService } from './services/employee.service';
import { EmployeeLifecycleService } from './services/employee-lifecycle.service';
import { HrCalendarService } from './services/hr-calendar.service';
import { HrAttendanceService } from './services/hr-attendance.service';
import { LeaveTypeService } from './services/leave-type.service';
import { LeaveBalanceService } from './services/leave-balance.service';
import { LeaveRequestService } from './services/leave-request.service';
import { LeaveApprovalService } from './services/leave-approval.service';
import { HolidayService } from './services/holiday.service';
import {
  SalaryStructureService,
  StatutoryDeductionService,
} from './services/salary-structure.service';
import { PayrollRunService } from './services/payroll-run.service';
import { BankTransferFileService } from './services/bank-transfer-file.service';
import {
  PayslipService,
  PayrollAdjustmentService,
} from './services/payslip.service';
import { TaxCertificateService } from './services/tax-certificate.service';
import { BonusService } from './services/bonus.service';
import { GratuityPolicyService } from './services/gratuity-policy.service';
import { GratuityProvisionService } from './services/gratuity-provision.service';
import { GratuitySettlementService } from './services/gratuity-settlement.service';
import { EncashmentService } from './services/encashment.service';
import { BenefitsService } from './services/benefits.service';
import { AppraisalService } from './services/appraisal.service';
import { RecruitmentService } from './services/recruitment.service';
import { TrainingService } from './services/training.service';
import { EmployeeStatusSyncJob } from './jobs/employee-status-sync.job';
import { PayrollCalculationProcessor } from './jobs/payroll-calculation.processor';
import { GratuityMonthlyProvisionJob } from './jobs/gratuity-monthly-provision.job';
import { GratuityEligibilityCheckJob } from './jobs/gratuity-eligibility-check.job';
import { PayrollReminderJob } from './jobs/payroll-reminder.job';
import { ContractExpiryAlertJob } from './jobs/contract-expiry-alert.job';
import {
  LoanRepaymentScheduleJob,
  BenefitPolicyExpiryAlertJob,
} from './jobs/loan-repayment-schedule.job';
import { AttendanceAnomalyJob } from './jobs/attendance-anomaly.job';
import { ExitSettlementListener } from './listeners/exit-settlement.listener';
import { GratuityEntitlementListener } from './listeners/gratuity-entitlement.listener';

@Module({
  imports: [
    AdminModule,
    forwardRef(() => AccountsModule),
    BullModule.registerQueue({ name: 'payroll' }),
    BullModule.registerQueue({ name: 'pdf' }),
  ],
  controllers: [
    EmployeeController,
    EmployeeDocumentController,
    HrAttendanceController,
    LeaveTypeController,
    LeaveRequestController,
    LeaveBalanceController,
    HolidayController,
    SalaryComponentController,
    SalaryStructureController,
    PayrollController,
    PayslipController,
    BonusController,
    GratuityPolicyController,
    GratuityController,
    EncashmentController,
    PerformanceController,
    RecruitmentController,
    TrainingController,
    BenefitsController,
  ],
  providers: [
    HrEmployeeReadService,
    EmployeeService,
    EmployeeLifecycleService,
    HrCalendarService,
    HrAttendanceService,
    LeaveTypeService,
    LeaveBalanceService,
    LeaveRequestService,
    LeaveApprovalService,
    HolidayService,
    SalaryStructureService,
    StatutoryDeductionService,
    PayrollRunService,
    BankTransferFileService,
    PayslipService,
    PayrollAdjustmentService,
    TaxCertificateService,
    BonusService,
    GratuityPolicyService,
    GratuityProvisionService,
    GratuitySettlementService,
    EncashmentService,
    BenefitsService,
    AppraisalService,
    RecruitmentService,
    TrainingService,
    EmployeeStatusSyncJob,
    PayrollCalculationProcessor,
    GratuityMonthlyProvisionJob,
    GratuityEligibilityCheckJob,
    PayrollReminderJob,
    ContractExpiryAlertJob,
    LoanRepaymentScheduleJob,
    BenefitPolicyExpiryAlertJob,
    AttendanceAnomalyJob,
    ExitSettlementListener,
    GratuityEntitlementListener,
  ],
  exports: [
    HrEmployeeReadService,
    HrCalendarService,
    HolidayService,
    EmployeeService,
    HrAttendanceService,
    LeaveBalanceService,
    PayrollRunService,
    GratuityProvisionService,
    EncashmentService,
  ],
})
export class HrModule {}
