import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { LedgerPort } from '../../../shared/ports/ledger.port';

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerPort,
    private readonly events: EventEmitter2,
  ) {}

  listPrograms() {
    return this.prisma.trainingProgram.findMany({
      orderBy: { startDate: 'desc' },
    });
  }

  createProgram(data: {
    name: string;
    programType: 'in_house' | 'external';
    provider?: string;
    description?: string;
    startDate: string;
    endDate: string;
    durationHours: number;
    venue?: string;
    maxParticipants: number;
    costPerParticipant?: number;
    totalBudget?: number;
    budgetLineId?: string;
    trainerName?: string;
  }) {
    return this.prisma.trainingProgram.create({
      data: {
        name: data.name,
        programType: data.programType,
        provider: data.provider,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        durationHours: data.durationHours,
        venue: data.venue,
        maxParticipants: data.maxParticipants,
        costPerParticipant: data.costPerParticipant,
        totalBudget: data.totalBudget,
        budgetLineId: data.budgetLineId,
        trainerName: data.trainerName,
        status: 'planned',
      },
    });
  }

  async updateProgram(id: string, data: Prisma.TrainingProgramUpdateInput) {
    return this.prisma.trainingProgram.update({ where: { id }, data });
  }

  async enroll(programId: string, employeeIds: string[], enrolledBy: string) {
    const program = await this.prisma.trainingProgram.findUnique({
      where: { id: programId },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!program) throw DomainException.notFound('Training program not found');

    const remaining = program.maxParticipants - program._count.enrollments;
    if (employeeIds.length > remaining) {
      throw DomainException.withCode(
        ErrorCode.CAPACITY_FULL,
        409,
        'Training enrollment would exceed capacity',
        { remaining, requested: employeeIds.length },
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const employeeId of employeeIds) {
        rows.push(
          await tx.trainingEnrollment.create({
            data: {
              programId,
              employeeId,
              enrolledBy,
              status: 'enrolled',
            },
          }),
        );
      }
      return rows;
    });

    await this.events.emitAsync(EventNames.TRAINING_ENROLLED, {
      programId,
      employeeIds,
      enrolledBy,
    });
    return created;
  }

  listSessions(programId: string) {
    return this.prisma.trainingSession.findMany({
      where: { programId },
      orderBy: { sessionDate: 'asc' },
    });
  }

  createSession(
    programId: string,
    input: {
      sessionDate: string;
      startTime: string;
      endTime: string;
      topic?: string;
    },
  ) {
    return this.prisma.trainingSession.create({
      data: {
        programId,
        sessionDate: new Date(input.sessionDate),
        startTime: new Date(`1970-01-01T${input.startTime}`),
        endTime: new Date(`1970-01-01T${input.endTime}`),
        topic: input.topic,
      },
    });
  }

  async markAttendance(
    sessionId: string,
    records: Array<{
      employeeId: string;
      status: 'present' | 'absent' | 'late';
    }>,
    markedBy: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const r of records) {
        results.push(
          await tx.trainingAttendance.upsert({
            where: {
              sessionId_employeeId: {
                sessionId,
                employeeId: r.employeeId,
              },
            },
            create: {
              sessionId,
              employeeId: r.employeeId,
              status: r.status,
              markedBy,
            },
            update: { status: r.status, markedBy },
          }),
        );
        if (r.status === 'present' || r.status === 'late') {
          await tx.trainingEnrollment.updateMany({
            where: {
              employeeId: r.employeeId,
              program: { sessions: { some: { id: sessionId } } },
            },
            data: { status: 'attended' },
          });
        }
      }
      return results;
    });
  }

  uploadCertificate(enrollmentId: string, certificateAttachmentId: string) {
    return this.attachCertificate(enrollmentId, certificateAttachmentId);
  }

  async attachCertificate(
    enrollmentId: string,
    certificateAttachmentId: string,
  ) {
    const enrollment = await this.prisma.trainingEnrollment.findUnique({
      where: { id: enrollmentId },
    });
    if (!enrollment) throw DomainException.notFound('Enrollment not found');
    if (
      enrollment.status !== 'attended' &&
      enrollment.status !== 'partially_attended'
    ) {
      throw DomainException.withCode(
        ErrorCode.NOT_ATTENDED,
        422,
        'Certificate requires an attended enrollment',
      );
    }
    return this.prisma.trainingEnrollment.update({
      where: { id: enrollmentId },
      data: { certificateAttachmentId },
    });
  }

  listCosts(programId: string) {
    return this.prisma.trainingCost.findMany({
      where: { programId },
      orderBy: { incurredDate: 'desc' },
    });
  }

  async addCost(
    programId: string,
    input: {
      costType: 'fee' | 'travel' | 'material' | 'venue' | 'other';
      amount: number;
      vendorName?: string;
      incurredDate: string;
    },
  ) {
    const program = await this.prisma.trainingProgram.findUnique({
      where: { id: programId },
    });
    if (!program) throw DomainException.notFound('Training program not found');

    return this.prisma.$transaction(async (tx) => {
      const cost = await tx.trainingCost.create({
        data: {
          programId,
          costType: input.costType,
          amount: input.amount,
          vendorName: input.vendorName,
          incurredDate: new Date(input.incurredDate),
        },
      });
      const posted = await this.ledger.post(
        {
          referenceType: 'training_cost',
          referenceId: cost.id,
          amount: input.amount,
          costCenter: 'admin',
          description: `Training cost ${program.name}`,
          debitAccountCode: '',
          creditAccountCode: '',
          postingDate: new Date(input.incurredDate),
          payload: { programId, costType: input.costType },
        },
        tx,
      );
      return tx.trainingCost.update({
        where: { id: cost.id },
        data: { journalId: posted.journalId },
      });
    });
  }

  employeeHistory(employeeId: string) {
    return this.prisma.trainingEnrollment.findMany({
      where: { employeeId },
      include: { program: true },
      orderBy: { enrolledAt: 'desc' },
    });
  }
}
