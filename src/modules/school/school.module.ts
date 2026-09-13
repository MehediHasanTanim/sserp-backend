import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminModule } from '../admin/admin.module';
import { HrModule } from '../hr/hr.module';
import { FilesModule } from '../files/files.module';

import { AcademicYearController } from './controllers/academic-year.controller';
import { ShiftController } from './controllers/shift.controller';
import { StudentController } from './controllers/student.controller';
import { StudentGuardianController } from './controllers/student-guardian.controller';
import { AdmissionFeeController } from './controllers/admission-fee.controller';
import { TeacherController } from './controllers/teacher.controller';
import { MappingController } from './controllers/mapping.controller';
import { SubstituteController } from './controllers/substitute.controller';
import { StudentAttendanceController } from './controllers/student-attendance.controller';
import { CurriculumController } from './controllers/curriculum.controller';
import { IepController } from './controllers/iep.controller';
import { IepReviewController } from './controllers/iep-review.controller';
import { ProgressReportController } from './controllers/progress-report.controller';
import { StudentHealthController } from './controllers/student-health.controller';
import { BehavioralController } from './controllers/behavioral.controller';
import { FeeStructureController } from './controllers/fee-structure.controller';
import { FeeInvoiceController } from './controllers/fee-invoice.controller';
import { FeePaymentController } from './controllers/fee-payment.controller';
import { ActivityController } from './controllers/activity.controller';
import { StudentLeaveController } from './controllers/student-leave.controller';

import { AcademicYearService } from './services/academic-year.service';
import { ShiftService } from './services/shift.service';
import { StudentStatusService } from './services/student-status.service';
import { StudentService } from './services/student.service';
import { AdmissionFeeService } from './services/admission-fee.service';
import { TeacherService } from './services/teacher.service';
import { TeacherMappingService } from './services/teacher-mapping.service';
import { SubstituteService } from './services/substitute.service';
import { WorkingDaysService } from './services/working-days.service';
import { SchoolAttendanceService } from './services/school-attendance.service';
import { CurriculumService } from './services/curriculum.service';
import { IepService } from './services/iep.service';
import { IepGoalService } from './services/iep-goal.service';
import { IepReviewService } from './services/iep-review.service';
import { ProgressReportService } from './services/progress-report.service';
import { StudentHealthService } from './services/student-health.service';
import { BehavioralService } from './services/behavioral.service';
import { FeeStructureService } from './services/fee-structure.service';
import { FeeInvoiceService } from './services/fee-invoice.service';
import { FeePaymentService } from './services/fee-payment.service';
import { FeeReminderService } from './services/fee-reminder.service';
import {
  ActivityService,
  ActivityEnrollmentService,
  ActivityAttendanceService,
  ActivityMediaService,
} from './services/activity.service';
import {
  StudentLeaveService,
  AttendanceExcusedLeaveListener,
} from './services/student-leave.service';

import { AdmissionFeePaidListener } from './listeners/admission-fee-paid.listener';
import { HrAbsenceListener } from './listeners/hr-absence.listener';
import {
  ActivityFeeListener,
  ActivityCancellationListener,
} from './listeners/activity.listeners';

import { StudentPolicy } from './policies/student.policy';
import { SchoolStudentReadService } from './services/school-student-read.service';

import { SchoolOpsJobs } from './jobs/school-ops.job';
import { Phase2OpsJobs } from './jobs/phase2-ops.job';
import { SchoolDocumentService } from './services/school-document.service';

@Module({
  imports: [
    AdminModule,
    HrModule,
    FilesModule,
    BullModule.registerQueue(
      { name: 'school-ops' },
      { name: 'pdf' },
      { name: 'billing' },
    ),
  ],
  controllers: [
    AcademicYearController,
    ShiftController,
    StudentController,
    StudentGuardianController,
    AdmissionFeeController,
    TeacherController,
    MappingController,
    SubstituteController,
    StudentAttendanceController,
    CurriculumController,
    IepController,
    IepReviewController,
    ProgressReportController,
    StudentHealthController,
    BehavioralController,
    FeeStructureController,
    FeeInvoiceController,
    FeePaymentController,
    ActivityController,
    StudentLeaveController,
  ],
  providers: [
    AcademicYearService,
    ShiftService,
    StudentStatusService,
    StudentService,
    AdmissionFeeService,
    TeacherService,
    TeacherMappingService,
    SubstituteService,
    WorkingDaysService,
    SchoolAttendanceService,
    CurriculumService,
    IepService,
    IepGoalService,
    IepReviewService,
    ProgressReportService,
    StudentHealthService,
    BehavioralService,
    FeeStructureService,
    FeeInvoiceService,
    FeePaymentService,
    FeeReminderService,
    ActivityService,
    ActivityEnrollmentService,
    ActivityAttendanceService,
    ActivityMediaService,
    StudentLeaveService,
    SchoolDocumentService,
    AdmissionFeePaidListener,
    HrAbsenceListener,
    ActivityFeeListener,
    ActivityCancellationListener,
    AttendanceExcusedLeaveListener,
    StudentPolicy,
    SchoolOpsJobs,
    Phase2OpsJobs,
    SchoolStudentReadService,
  ],
  exports: [
    StudentStatusService,
    WorkingDaysService,
    FeePaymentService,
    FeeInvoiceService,
    IepService,
    StudentLeaveService,
    SchoolAttendanceService,
    ActivityEnrollmentService,
    SchoolStudentReadService,
    SchoolDocumentService,
    ProgressReportService,
  ],
})
export class SchoolModule {}
