import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class StockLevelService {
  constructor(private readonly prisma: PrismaService) {}

  list(filters?: { itemId?: string; locationId?: string }) {
    return this.prisma.stockLevel.findMany({
      where: {
        itemId: filters?.itemId,
        locationId: filters?.locationId,
      },
      include: { item: true, location: true },
      orderBy: { lastMovementAt: 'desc' },
    });
  }

  async lowStock() {
    const levels = await this.prisma.stockLevel.findMany({
      include: { item: true, location: true },
    });
    return levels.filter(
      (l) => Number(l.quantityOnHand) < Number(l.item.minimumStockLevel),
    );
  }

  expiring(withinDays = 30) {
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + withinDays);
    return this.prisma.stockBatch.findMany({
      where: {
        remainingQuantity: { gt: 0 },
        expiryDate: { lte: until, not: null },
      },
      include: { item: true, location: true },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async valuation() {
    const levels = await this.prisma.stockLevel.findMany({
      include: { item: true },
    });
    return levels.map((l) => ({
      itemId: l.itemId,
      itemCode: l.item.itemCode,
      locationId: l.locationId,
      quantityOnHand: Number(l.quantityOnHand),
      averageCost: l.averageCost,
      valuation: Math.round(Number(l.quantityOnHand) * l.averageCost),
    }));
  }
}
