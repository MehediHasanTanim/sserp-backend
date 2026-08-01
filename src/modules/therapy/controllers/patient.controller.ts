import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser, AuthUser, Roles } from '../../../shared/decorators';
import { PatientService } from '../services/patient.service';

@Controller('therapy/patients')
@Roles('admin', 'therapy_coordinator', 'therapist')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post('from-student')
  @Roles('admin', 'therapy_coordinator')
  createFromStudent(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.patientService.createFromStudent(body, user.id);
  }

  @Post('external')
  @Roles('admin', 'therapy_coordinator')
  createExternal(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.patientService.createExternal(body, user.id);
  }

  @Get()
  list() {
    return this.patientService.list();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.patientService.findByIdWithStudentInfo(id);
  }

  @Put(':id/medical-history')
  updateMedicalHistory(
    @Param('id') patientId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.patientService.updateMedicalHistory(patientId, body, user.id);
  }

  @Post(':id/consents')
  addConsent(
    @Param('id') patientId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.patientService.addConsent(patientId, {
      ...body,
      signedBy: user.id,
    });
  }

  @Post(':id/referrals')
  addReferral(@Param('id') patientId: string, @Body() body: any) {
    return this.patientService.addReferral({ ...body, patientId });
  }

  @Post(':id/discharge')
  @Roles('admin', 'therapy_coordinator')
  discharge(
    @Param('id') patientId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.patientService.discharge({ patientId, ...body }, user.id);
  }
}
