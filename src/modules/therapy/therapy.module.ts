import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminModule } from '../admin/admin.module';
import { HrModule } from '../hr/hr.module';
import { SchoolModule } from '../school/school.module';

import { TherapistController } from './controllers/therapist.controller';
import { PatientController } from './controllers/patient.controller';
import { SessionController } from './controllers/session.controller';
import { GroupController } from './controllers/group.controller';
import { TreatmentPlanController } from './controllers/treatment-plan.controller';
import {
  TherapyBillingController,
  WaitingListController,
} from './controllers/therapy-billing.controller';

import { TherapistService } from './services/therapist.service';
import { PatientService } from './services/patient.service';
import { ConflictDetectionService } from './services/conflict-detection.service';
import { SessionService } from './services/session.service';
import { RecurrenceService } from './services/recurrence.service';
import { GroupService } from './services/group.service';
import { TreatmentPlanService } from './services/treatment-plan.service';
import { TherapyBillingService } from './services/therapy-billing.service';
import { WaitingListService } from './services/waiting-list.service';

import { HrLeaveConflictListener } from './listeners/hr-leave-conflict.listener';
import { SessionCompletedListener } from './listeners/session-completed.listener';

import { TherapyOpsJob } from './jobs/therapy-ops.job';

@Module({
  imports: [
    AdminModule,
    HrModule,
    SchoolModule,
    BullModule.registerQueue({ name: 'therapy-ops' }),
  ],
  controllers: [
    TherapistController,
    PatientController,
    SessionController,
    GroupController,
    TreatmentPlanController,
    TherapyBillingController,
    WaitingListController,
  ],
  providers: [
    TherapistService,
    PatientService,
    ConflictDetectionService,
    SessionService,
    RecurrenceService,
    GroupService,
    TreatmentPlanService,
    TherapyBillingService,
    WaitingListService,
    HrLeaveConflictListener,
    SessionCompletedListener,
    TherapyOpsJob,
  ],
  exports: [
    TherapistService,
    PatientService,
    SessionService,
    ConflictDetectionService,
  ],
})
export class TherapyModule {}
