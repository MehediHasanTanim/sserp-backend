import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import {
  CreateImmunizationDto,
  CreateMedicalIncidentDto,
  UpsertMedicalRecordDto,
} from '../dto/health.dto';

/**
 * Student medical records, immunizations, and medical incidents.
 * docs/plan/backend/03-phase2-school-advanced.md §3 (Health and behaviour).
 */
@Injectable()
export class StudentHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  private async assertStudentExists(studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (!student) throw DomainException.notFound('Student not found');
    return student;
  }

  async getMedicalRecord(studentId: string) {
    await this.assertStudentExists(studentId);
    const record = await this.prisma.studentMedicalRecord.findUnique({
      where: { studentId },
    });
    if (!record) throw DomainException.notFound('Medical record not found');
    return record;
  }

  async upsertMedicalRecord(
    studentId: string,
    input: UpsertMedicalRecordDto,
    actorId: string,
  ) {
    await this.assertStudentExists(studentId);
    return this.prisma.studentMedicalRecord.upsert({
      where: { studentId },
      create: {
        studentId,
        conditions: input.conditions as object | undefined,
        allergies: input.allergies as object | undefined,
        medications: input.medications as object | undefined,
        emergencyProtocol: input.emergencyProtocol,
        bloodGroup: input.bloodGroup,
        physicianName: input.physicianName,
        physicianPhone: input.physicianPhone,
        hasAlertFlag: input.hasAlertFlag ?? false,
        alertSummary: input.alertSummary,
        updatedBy: actorId,
      },
      update: {
        conditions: input.conditions as object | undefined,
        allergies: input.allergies as object | undefined,
        medications: input.medications as object | undefined,
        emergencyProtocol: input.emergencyProtocol,
        bloodGroup: input.bloodGroup,
        physicianName: input.physicianName,
        physicianPhone: input.physicianPhone,
        hasAlertFlag: input.hasAlertFlag,
        alertSummary: input.alertSummary,
        updatedBy: actorId,
      },
    });
  }

  async getAlerts(studentId: string) {
    await this.assertStudentExists(studentId);
    const record = await this.prisma.studentMedicalRecord.findUnique({
      where: { studentId },
      select: {
        hasAlertFlag: true,
        alertSummary: true,
        allergies: true,
        conditions: true,
      },
    });
    return (
      record ?? {
        hasAlertFlag: false,
        alertSummary: null,
        allergies: null,
        conditions: null,
      }
    );
  }

  async listImmunizations(studentId: string) {
    await this.assertStudentExists(studentId);
    return this.prisma.studentImmunization.findMany({
      where: { studentId },
      orderBy: { administeredDate: 'desc' },
    });
  }

  async addImmunization(studentId: string, input: CreateImmunizationDto) {
    await this.assertStudentExists(studentId);
    return this.prisma.studentImmunization.create({
      data: {
        studentId,
        vaccineName: input.vaccineName,
        doseNumber: input.doseNumber,
        administeredDate: new Date(input.administeredDate),
        nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : undefined,
        attachmentId: input.attachmentId,
      },
    });
  }

  async listMedicalIncidents(studentId: string) {
    await this.assertStudentExists(studentId);
    return this.prisma.medicalIncident.findMany({
      where: { studentId },
      orderBy: { incidentDatetime: 'desc' },
    });
  }

  async addMedicalIncident(
    studentId: string,
    input: CreateMedicalIncidentDto,
    actorId: string,
  ) {
    await this.assertStudentExists(studentId);
    const incident = await this.prisma.medicalIncident.create({
      data: {
        studentId,
        incidentDatetime: new Date(input.incidentDatetime),
        incidentType: input.incidentType,
        description: input.description,
        actionTaken: input.actionTaken,
        severity: input.severity,
        reportedBy: actorId,
        attachmentIds: input.attachmentIds ?? [],
      },
    });

    await this.events.emitAsync(EventNames.MEDICAL_INCIDENT_RECORDED, {
      studentId,
      incidentId: incident.id,
      severity: incident.severity,
      incidentType: incident.incidentType,
    });

    return incident;
  }
}
