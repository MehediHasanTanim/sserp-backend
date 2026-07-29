import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const DEFAULT_TZ = 'Asia/Dhaka';

@Injectable()
export class OrgClockService {
  private timezone = DEFAULT_TZ;

  constructor(private readonly prisma: PrismaService) {}

  async refresh() {
    const org = await this.prisma.organizationSettings.findFirst();
    if (org?.timezone) this.timezone = org.timezone;
  }

  getTimezone() {
    return this.timezone;
  }

  nowUtc(): Date {
    return new Date();
  }

  toOrgLocal(date: Date): Date {
    return toZonedTime(date, this.timezone);
  }

  formatOrg(date: Date, pattern = 'yyyy-MM-dd HH:mm:ss'): string {
    return formatInTimeZone(date, this.timezone, pattern);
  }
}
