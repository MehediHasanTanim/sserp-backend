import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { EmployeeController } from './controllers/employee.controller';
import { EmployeeDocumentController } from './controllers/employee-document.controller';
import { HrAttendanceController } from './controllers/hr-attendance.controller';
import { LeaveTypeController } from './controllers/leave-type.controller';
import { LeaveRequestController } from './controllers/leave-request.controller';
import { LeaveBalanceController } from './controllers/leave-balance.controller';
import { HolidayController } from './controllers/holiday.controller';
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
import { EmployeeStatusSyncJob } from './jobs/employee-status-sync.job';

@Module({
  imports: [AdminModule],
  controllers: [
    EmployeeController,
    EmployeeDocumentController,
    HrAttendanceController,
    LeaveTypeController,
    LeaveRequestController,
    LeaveBalanceController,
    HolidayController,
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
    EmployeeStatusSyncJob,
  ],
  exports: [
    // Consumed by School/Therapy modules per the HR/School boundary rule.
    HrEmployeeReadService,
    HrCalendarService,
    HolidayService,
    EmployeeService,
    HrAttendanceService,
    LeaveBalanceService,
  ],
})
export class HrModule {}
