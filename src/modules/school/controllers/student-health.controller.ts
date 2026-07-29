import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { StudentHealthService } from '../services/student-health.service';
import {
  CreateImmunizationDto,
  CreateMedicalIncidentDto,
  UpsertMedicalRecordDto,
} from '../dto/health.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school/students/:id')
export class StudentHealthController {
  constructor(private readonly health: StudentHealthService) {}

  @Get('medical-record')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  getMedicalRecord(@Param('id') studentId: string) {
    return this.health.getMedicalRecord(studentId);
  }

  @Put('medical-record')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'medical_record', action: 'upsert' })
  upsertMedicalRecord(
    @Param('id') studentId: string,
    @Body() dto: UpsertMedicalRecordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.health.upsertMedicalRecord(studentId, dto, user.id);
  }

  @Get('medical-alerts')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:read')
  getAlerts(@Param('id') studentId: string) {
    return this.health.getAlerts(studentId);
  }

  @Get('immunizations')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:read')
  listImmunizations(@Param('id') studentId: string) {
    return this.health.listImmunizations(studentId);
  }

  @Post('immunizations')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'immunization', action: 'create' })
  addImmunization(
    @Param('id') studentId: string,
    @Body() dto: CreateImmunizationDto,
  ) {
    return this.health.addImmunization(studentId, dto);
  }

  @Get('medical-incidents')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:read')
  listMedicalIncidents(@Param('id') studentId: string) {
    return this.health.listMedicalIncidents(studentId);
  }

  @Post('medical-incidents')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'medical_incident', action: 'create' })
  addMedicalIncident(
    @Param('id') studentId: string,
    @Body() dto: CreateMedicalIncidentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.health.addMedicalIncident(studentId, dto, user.id);
  }
}
