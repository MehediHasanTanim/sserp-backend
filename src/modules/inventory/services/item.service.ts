import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { NumberingService } from '../../admin/services/organization.service';

@Injectable()
export class ItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  listCategories() {
    return this.prisma.itemCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  createCategory(data: {
    name: string;
    parentId?: string;
    isAssetCategory?: boolean;
    defaultCoaExpenseCode?: string;
    defaultCoaAssetCode?: string;
  }) {
    return this.prisma.itemCategory.create({ data });
  }

  updateCategory(
    id: string,
    data: {
      name?: string;
      isAssetCategory?: boolean;
      defaultCoaExpenseCode?: string;
      defaultCoaAssetCode?: string;
      isActive?: boolean;
    },
  ) {
    return this.prisma.itemCategory.update({ where: { id }, data });
  }

  listUnits() {
    return this.prisma.unitOfMeasure.findMany({ orderBy: { code: 'asc' } });
  }

  createUnit(data: { code: string; name: string; allowsFraction?: boolean }) {
    return this.prisma.unitOfMeasure.create({ data });
  }

  listLocations() {
    return this.prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  createLocation(data: {
    name: string;
    locationType: 'store' | 'department' | 'room';
    department?: string;
    parentId?: string;
  }) {
    return this.prisma.location.create({ data });
  }

  updateLocation(id: string, data: { name?: string; isActive?: boolean }) {
    return this.prisma.location.update({ where: { id }, data });
  }

  async listItems(filters?: {
    categoryId?: string;
    nature?: string;
    lowStock?: boolean;
  }) {
    const items = await this.prisma.item.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        categoryId: filters?.categoryId,
        itemNature: filters?.nature as never,
      },
      include: {
        category: true,
        unitOfMeasure: true,
        stockLevels: true,
      },
      orderBy: { name: 'asc' },
    });
    if (!filters?.lowStock) return items;
    return items.filter((i) =>
      i.stockLevels.some(
        (l) => Number(l.quantityOnHand) < Number(i.minimumStockLevel),
      ),
    );
  }

  async getItem(id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        unitOfMeasure: true,
        stockLevels: { include: { location: true } },
      },
    });
    if (!item) throw DomainException.notFound('Item not found');
    return item;
  }

  async createItem(data: {
    name: string;
    description?: string;
    categoryId: string;
    unitOfMeasureId: string;
    itemNature: 'consumable' | 'asset' | 'spare';
    valuationMethod?: 'fifo' | 'weighted_average';
    minimumStockLevel?: number;
    reorderQuantity?: number;
    maximumStockLevel?: number;
    tracksExpiry?: boolean;
    tracksSerial?: boolean;
    manufacturer?: string;
    brand?: string;
    model?: string;
    standardCost?: number;
  }) {
    const org = await this.prisma.organizationSettings.findFirst();
    const itemCode = await this.numbering.nextCode('item');
    return this.prisma.item.create({
      data: {
        itemCode,
        name: data.name,
        description: data.description,
        categoryId: data.categoryId,
        unitOfMeasureId: data.unitOfMeasureId,
        itemNature: data.itemNature,
        valuationMethod:
          data.valuationMethod ??
          org?.defaultValuationMethod ??
          'weighted_average',
        minimumStockLevel: data.minimumStockLevel ?? 0,
        reorderQuantity: data.reorderQuantity ?? 0,
        maximumStockLevel: data.maximumStockLevel,
        tracksExpiry: data.tracksExpiry ?? false,
        tracksSerial: data.tracksSerial ?? false,
        manufacturer: data.manufacturer,
        brand: data.brand,
        model: data.model,
        standardCost: data.standardCost,
        isActive: true,
      },
    });
  }

  async updateItem(id: string, data: Prisma.ItemUpdateInput) {
    await this.getItem(id);
    return this.prisma.item.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    await this.getItem(id);
    return this.prisma.item.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
