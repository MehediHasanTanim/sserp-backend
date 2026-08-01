import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TherapyType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';

export interface AddToWaitingListDto {
  patientId: string;
  therapyType: TherapyType;
  preferredTherapistId?: string;
  preferredDays?: number[];
  preferredTimeFrom?: Date;
  preferredTimeTo?: Date;
  groupId?: string;
  priority?: number;
  notes?: string;
}

const OFFER_EXPIRY_HOURS = 48;

@Injectable()
export class WaitingListService {
  private readonly logger = new Logger(WaitingListService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async add(dto: AddToWaitingListDto) {
    return this.prisma.therapyWaitingList.create({
      data: {
        patientId: dto.patientId,
        therapyType: dto.therapyType,
        preferredTherapistId: dto.preferredTherapistId,
        preferredDays: dto.preferredDays ?? [],
        preferredTimeFrom: dto.preferredTimeFrom,
        preferredTimeTo: dto.preferredTimeTo,
        groupId: dto.groupId,
        priority: dto.priority ?? 0,
        requestedDate: new Date(),
        status: 'waiting',
        notes: dto.notes,
      },
    });
  }

  async sendOffer(waitingListId: string) {
    const entry = await this.prisma.therapyWaitingList.findUnique({
      where: { id: waitingListId },
    });
    if (!entry) throw DomainException.notFound('Waiting list entry not found');
    if (entry.status !== 'waiting')
      throw DomainException.conflict('Entry is not in waiting status');

    const expiresAt = new Date(Date.now() + OFFER_EXPIRY_HOURS * 3600000);

    const updated = await this.prisma.therapyWaitingList.update({
      where: { id: waitingListId },
      data: {
        status: 'offered',
        offeredAt: new Date(),
        offerExpiresAt: expiresAt,
      },
    });

    this.events.emit(EventNames.WAITING_LIST_OFFER_SENT, {
      waitingListId,
      patientId: entry.patientId,
      expiresAt,
    });

    return updated;
  }

  async convertToScheduled(waitingListId: string) {
    return this.prisma.therapyWaitingList.update({
      where: { id: waitingListId },
      data: { status: 'scheduled' },
    });
  }

  async expireOffers() {
    const now = new Date();
    const expired = await this.prisma.therapyWaitingList.findMany({
      where: { status: 'offered', offerExpiresAt: { lte: now } },
    });

    for (const entry of expired) {
      await this.prisma.therapyWaitingList.update({
        where: { id: entry.id },
        data: { status: 'waiting', offeredAt: null, offerExpiresAt: null },
      });
      this.events.emit(EventNames.WAITING_LIST_OFFER_EXPIRED, {
        waitingListId: entry.id,
        patientId: entry.patientId,
      });
    }

    return expired.length;
  }

  async cancel(waitingListId: string) {
    return this.prisma.therapyWaitingList.update({
      where: { id: waitingListId },
      data: { status: 'cancelled' },
    });
  }

  async listActive(therapyType?: TherapyType) {
    return this.prisma.therapyWaitingList.findMany({
      where: {
        status: { in: ['waiting', 'offered'] },
        ...(therapyType ? { therapyType } : {}),
      },
      orderBy: [{ priority: 'desc' }, { requestedDate: 'asc' }],
    });
  }
}
