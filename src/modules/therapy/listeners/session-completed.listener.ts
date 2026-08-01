import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TherapyBillingService } from '../services/therapy-billing.service';
import { EventNames } from '../../../shared/events/event-names';

interface SessionCompletedPayload {
  sessionId: string;
  therapistId: string;
  patientId?: string;
  groupId?: string;
  completedBy: string;
}

/**
 * On session complete: generate per-session invoice.
 * For group sessions: one invoice per attending patient.
 */
@Injectable()
export class SessionCompletedListener {
  private readonly logger = new Logger(SessionCompletedListener.name);

  constructor(private readonly billing: TherapyBillingService) {}

  @OnEvent(EventNames.SESSION_COMPLETED)
  async handleSessionCompleted(payload: SessionCompletedPayload) {
    try {
      if (payload.patientId) {
        await this.billing.generatePerSessionInvoice(
          payload.sessionId,
          payload.completedBy,
        );
      } else if (payload.groupId) {
        // For group: billing is per-patient per-attendance; handled via monthly consolidated job
        // Per BI-07: no group-level discount
        this.logger.log(
          `Group session ${payload.sessionId} completed; billing deferred to monthly job`,
        );
      }
    } catch (err: any) {
      // Log but don't block — invoice can be generated manually
      this.logger.error(
        `Failed to auto-generate invoice for session ${payload.sessionId}: ${err.message}`,
      );
    }
  }
}
