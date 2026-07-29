import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HolidayType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { CacheService } from '../../../shared/cache/redis.module';

export interface CreateHolidayInput {
  name: string;
  holidayDate: string;
  type: HolidayType;
  academicYearId?: string;
  appliesToDepartments?: string[];
  description?: string;
}

export type UpdateHolidayInput = Partial<CreateHolidayInput>;

@Injectable()
export class HolidayService {
  private readonly logger = new Logger(HolidayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Optional() private readonly cache?: CacheService,
  ) {}

  async list(query: {
    year?: number;
    type?: HolidayType;
    department?: string;
  }) {
    const where: Prisma.HolidayWhereInput = {};
    if (query.year) {
      where.holidayDate = {
        gte: new Date(Date.UTC(query.year, 0, 1)),
        lte: new Date(Date.UTC(query.year, 11, 31)),
      };
    }
    if (query.type) where.type = query.type;
    if (query.department) {
      where.OR = [
        { appliesToDepartments: { isEmpty: true } },
        { appliesToDepartments: { has: query.department } },
      ];
    }
    return this.prisma.holiday.findMany({
      where,
      orderBy: { holidayDate: 'asc' },
    });
  }

  async get(id: string) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) throw DomainException.notFound('Holiday not found');
    return holiday;
  }

  async create(input: CreateHolidayInput) {
    const holidayDate = new Date(input.holidayDate);
    const existing = await this.prisma.holiday.findUnique({
      where: { holidayDate_type: { holidayDate, type: input.type } },
    });
    if (existing) {
      throw DomainException.conflict(
        'A holiday of this type already exists on this date',
      );
    }
    const holiday = await this.prisma.holiday.create({
      data: {
        name: input.name,
        holidayDate,
        type: input.type,
        academicYearId: input.academicYearId,
        appliesToDepartments: input.appliesToDepartments ?? [],
        description: input.description,
      },
    });
    await this.onChanged(holidayDate.getUTCFullYear());
    return holiday;
  }

  async update(id: string, input: UpdateHolidayInput) {
    const existing = await this.get(id);
    const holiday = await this.prisma.holiday.update({
      where: { id },
      data: {
        name: input.name,
        holidayDate: input.holidayDate
          ? new Date(input.holidayDate)
          : undefined,
        type: input.type,
        academicYearId: input.academicYearId,
        appliesToDepartments: input.appliesToDepartments,
        description: input.description,
      },
    });
    await this.onChanged(existing.holidayDate.getUTCFullYear());
    if (
      holiday.holidayDate.getUTCFullYear() !==
      existing.holidayDate.getUTCFullYear()
    ) {
      await this.onChanged(holiday.holidayDate.getUTCFullYear());
    }
    return holiday;
  }

  async remove(id: string) {
    const existing = await this.get(id);
    await this.prisma.holiday.delete({ where: { id } });
    await this.onChanged(existing.holidayDate.getUTCFullYear());
    return { ok: true };
  }

  async bulkImport(holidays: CreateHolidayInput[]) {
    const years = new Set<number>();
    const created = await this.prisma.$transaction(async (tx) => {
      let count = 0;
      for (const input of holidays) {
        const holidayDate = new Date(input.holidayDate);
        years.add(holidayDate.getUTCFullYear());
        const result = await tx.holiday.upsert({
          where: { holidayDate_type: { holidayDate, type: input.type } },
          create: {
            name: input.name,
            holidayDate,
            type: input.type,
            academicYearId: input.academicYearId,
            appliesToDepartments: input.appliesToDepartments ?? [],
            description: input.description,
          },
          update: {
            name: input.name,
            academicYearId: input.academicYearId,
            appliesToDepartments: input.appliesToDepartments ?? [],
            description: input.description,
          },
        });
        if (result) count += 1;
      }
      return count;
    });
    for (const year of years) {
      await this.onChanged(year);
    }
    return { imported: created };
  }

  private async onChanged(year: number) {
    if (this.cache) {
      try {
        await this.cache.del(`holidays:${year}`);
      } catch (err) {
        this.logger.warn(`Failed to invalidate holidays:${year} cache: ${err}`);
      }
    }
    await this.events.emitAsync(EventNames.HOLIDAY_CHANGED, { year });
  }
}
