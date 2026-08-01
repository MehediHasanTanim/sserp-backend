import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  BiometricAdapter,
  BiometricPunch,
} from '../providers/optional-integrations';
import { HrAttendanceService } from '../../hr/services/hr-attendance.service';

/**
 * Polls biometric adapter and upserts HR attendance when FEATURE_BIOMETRIC is on.
 */
@Injectable()
export class BiometricSyncService {
  private readonly logger = new Logger(BiometricSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: BiometricAdapter,
    private readonly attendance: HrAttendanceService,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/15 * * * *')
  async scheduledPoll() {
    if (!this.config.get('featureBiometric')) return { imported: 0 };
    return this.pollAndApply();
  }

  async pollAndApply(since?: Date) {
    const punches = await this.adapter.fetchPunches(
      since ?? new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    return this.applyPunches(punches);
  }

  async applyPunches(punches: BiometricPunch[]) {
    if (!punches.length) return { imported: 0 };

    const deviceIds = [...new Set(punches.map((p) => p.deviceUserId))];
    const employees = await this.prisma.employee.findMany({
      where: {
        biometricDeviceUserId: { in: deviceIds },
        deletedAt: null,
      },
      select: { id: true, biometricDeviceUserId: true },
    });
    const byDevice = new Map(
      employees.map((e) => [e.biometricDeviceUserId!, e.id]),
    );

    const byEmployeeDay = new Map<
      string,
      { employeeId: string; date: string; checkIn?: string; checkOut?: string }
    >();

    for (const punch of punches) {
      const employeeId = byDevice.get(punch.deviceUserId);
      if (!employeeId) continue;
      const date = punch.punchedAt.toISOString().slice(0, 10);
      const key = `${employeeId}:${date}`;
      const row = byEmployeeDay.get(key) ?? { employeeId, date };
      const iso = punch.punchedAt.toISOString();
      if (punch.type === 'in') {
        if (!row.checkIn || iso < row.checkIn) row.checkIn = iso;
      } else {
        if (!row.checkOut || iso > row.checkOut) row.checkOut = iso;
      }
      byEmployeeDay.set(key, row);
    }

    const items = [...byEmployeeDay.values()].map((r) => ({
      employeeId: r.employeeId,
      attendanceDate: r.date,
      status: 'present' as const,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      remarks: 'biometric',
    }));

    if (!items.length) return { imported: 0 };

    // Use a synthetic system marker; bulkSubmit stores markedBy
    const systemUser = await this.prisma.user.findFirst({
      where: { isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!systemUser) return { imported: 0 };

    await this.attendance.bulkSubmit(items, systemUser.id);
    this.logger.log(`biometric sync imported ${items.length} attendance row(s)`);
    return { imported: items.length };
  }
}
