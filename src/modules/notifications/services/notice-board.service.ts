import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

@Injectable()
export class NoticeBoardService {
  constructor(private readonly prisma: PrismaService) {}

  async list(activeOnly = true) {
    const now = new Date();
    return this.prisma.noticeBoardItem.findMany({
      where: activeOnly
        ? {
            isActive: true,
            OR: [{ validFrom: null }, { validFrom: { lte: now } }],
            AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: now } }] }],
          }
        : undefined,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(
    userId: string,
    input: {
      title: string;
      body: string;
      category?: string;
      attachmentIds?: string[];
      validFrom?: Date;
      validUntil?: Date;
      isPinned?: boolean;
    },
  ) {
    return this.prisma.noticeBoardItem.create({
      data: {
        title: input.title,
        body: input.body,
        category: input.category,
        attachmentIds: input.attachmentIds ?? [],
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        isPinned: input.isPinned ?? false,
        createdBy: userId,
        isActive: true,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      title: string;
      body: string;
      isPinned: boolean;
      isActive: boolean;
    }>,
  ) {
    const item = await this.prisma.noticeBoardItem.findUnique({
      where: { id },
    });
    if (!item) throw DomainException.notFound('Notice board item not found');
    return this.prisma.noticeBoardItem.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.noticeBoardItem.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
