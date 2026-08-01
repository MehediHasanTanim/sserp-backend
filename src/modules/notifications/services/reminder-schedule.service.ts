import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

@Injectable()
export class ReminderScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.reminderSchedule.findMany({
      orderBy: { reminderCode: 'asc' },
    });
  }

  async create(data: {
    reminderCode: string;
    name: string;
    targetEvent: string;
    offsetDays: number;
    repeatIntervalDays?: number;
    maxRepeats?: number;
    channels: string[];
  }) {
    return this.prisma.reminderSchedule.create({
      data: { ...data, isActive: true },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      offsetDays: number;
      repeatIntervalDays: number;
      maxRepeats: number;
      channels: string[];
      isActive: boolean;
    }>,
  ) {
    const row = await this.prisma.reminderSchedule.findUnique({
      where: { id },
    });
    if (!row) throw DomainException.notFound('Reminder schedule not found');
    return this.prisma.reminderSchedule.update({ where: { id }, data });
  }
}
