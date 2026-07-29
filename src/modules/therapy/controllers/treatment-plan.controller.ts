import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser, AuthUser, Roles } from '../../../shared/decorators';
import { TreatmentPlanService } from '../services/treatment-plan.service';

@Controller('therapy/treatment-plans')
@Roles('admin', 'therapy_coordinator', 'therapist')
export class TreatmentPlanController {
  constructor(private readonly treatmentPlanService: TreatmentPlanService) {}

  @Post()
  create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.treatmentPlanService.create(body, user.id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.treatmentPlanService.findById(id);
  }

  @Get('patient/:patientId')
  listByPatient(@Param('patientId') patientId: string) {
    return this.treatmentPlanService.listByPatient(patientId);
  }

  @Put(':id/activate')
  activate(@Param('id') planId: string) {
    return this.treatmentPlanService.activate(planId);
  }

  @Put(':id/share')
  shareWithGuardian(@Param('id') planId: string) {
    return this.treatmentPlanService.shareWithGuardian(planId);
  }

  @Post('goals/:goalId/progress')
  recordProgress(
    @Param('goalId') treatmentGoalId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.treatmentPlanService.recordGoalProgress(
      { treatmentGoalId, ...body },
      user.id,
    );
  }
}
