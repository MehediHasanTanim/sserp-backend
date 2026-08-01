import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PayrollRunService } from '../services/payroll-run.service';

@Processor('payroll')
export class PayrollCalculationProcessor extends WorkerHost {
  private readonly logger = new Logger(PayrollCalculationProcessor.name);

  constructor(private readonly runs: PayrollRunService) {
    super();
  }

  async process(job: Job<{ payrollRunId: string }>) {
    this.logger.log(`Calculating payroll run ${job.data.payrollRunId}`);
    return this.runs.performCalculation(job.data.payrollRunId);
  }
}
