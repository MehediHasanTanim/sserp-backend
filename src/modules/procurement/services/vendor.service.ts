import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  VendorDocumentType,
  VendorStatus,
  VendorType,
} from '@prisma/client';
import { NumberingService } from '../../admin/services/organization.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';

const VENDOR_INCLUDE = {
  documents: true,
  performanceRatings: { orderBy: { ratedAt: 'desc' as const }, take: 10 },
};

@Injectable()
export class VendorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
  ) {}

  list(filters?: { status?: VendorStatus; search?: string }) {
    return this.prisma.vendor.findMany({
      where: {
        deletedAt: null,
        status: filters?.status,
        OR: filters?.search
          ? [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { vendorCode: { contains: filters.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const row = await this.prisma.vendor.findFirst({
      where: { id, deletedAt: null },
      include: VENDOR_INCLUDE,
    });
    if (!row) throw DomainException.notFound('Vendor not found');
    return row;
  }

  async create(
    input: {
      name: string;
      vendorType: VendorType;
      categories?: string[];
      contactPerson?: string;
      phone?: string;
      email?: string;
      address?: string;
      taxRegistrationNumber?: string;
      bankDetails?: Prisma.InputJsonValue;
      paymentTermsDays?: number;
      coaPayableAccountCode?: string;
    },
    _actorId: string,
  ) {
    const vendorCode = await this.numbering.nextCode('vendor');
    return this.prisma.vendor.create({
      data: {
        vendorCode,
        name: input.name,
        vendorType: input.vendorType,
        categories: input.categories ?? [],
        contactPerson: input.contactPerson,
        phone: input.phone,
        email: input.email,
        address: input.address,
        taxRegistrationNumber: input.taxRegistrationNumber,
        bankDetails: input.bankDetails,
        paymentTermsDays: input.paymentTermsDays,
        coaPayableAccountCode: input.coaPayableAccountCode ?? '2010',
        status: 'active',
      },
    });
  }

  async update(
    id: string,
    input: {
      name?: string;
      vendorType?: VendorType;
      categories?: string[];
      contactPerson?: string;
      phone?: string;
      email?: string;
      address?: string;
      taxRegistrationNumber?: string;
      bankDetails?: Prisma.InputJsonValue;
      paymentTermsDays?: number;
      isPreferred?: boolean;
      coaPayableAccountCode?: string;
    },
  ) {
    await this.findById(id);
    return this.prisma.vendor.update({
      where: { id },
      data: input,
    });
  }

  async blacklist(id: string, reason: string, actorId: string) {
    if (!reason?.trim()) {
      throw DomainException.validation('Blacklist reason is required');
    }
    const vendor = await this.prisma.vendor.update({
      where: { id },
      data: {
        status: 'blacklisted',
        blacklistReason: reason,
        blacklistedAt: new Date(),
      },
    });
    this.events.emit(EventNames.VENDOR_BLACKLISTED, {
      vendorId: id,
      reason,
      actorId,
    });
    return vendor;
  }

  async reactivate(id: string) {
    await this.findById(id);
    return this.prisma.vendor.update({
      where: { id },
      data: {
        status: 'active',
        blacklistReason: null,
        blacklistedAt: null,
      },
    });
  }

  listPreferred() {
    return this.prisma.vendor.findMany({
      where: { deletedAt: null, isPreferred: true, status: 'active' },
      orderBy: { name: 'asc' },
    });
  }

  async addDocument(
    vendorId: string,
    input: {
      documentType: VendorDocumentType;
      attachmentId: string;
      issuedDate?: string;
      expiryDate?: string;
    },
  ) {
    await this.findById(vendorId);
    return this.prisma.vendorDocument.create({
      data: {
        vendorId,
        documentType: input.documentType,
        attachmentId: input.attachmentId,
        issuedDate: input.issuedDate ? new Date(input.issuedDate) : undefined,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
      },
    });
  }

  async listDocuments(vendorId: string) {
    await this.findById(vendorId);
    return this.prisma.vendorDocument.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addRating(
    vendorId: string,
    input: {
      poId: string;
      deliveryTimelinessScore: number;
      qualityScore: number;
      pricingScore: number;
      responsivenessScore: number;
      comments?: string;
    },
    ratedBy: string,
  ) {
    await this.findById(vendorId);
    const overall =
      (input.deliveryTimelinessScore +
        input.qualityScore +
        input.pricingScore +
        input.responsivenessScore) /
      4;
    const rating = await this.prisma.vendorPerformanceRating.create({
      data: {
        vendorId,
        poId: input.poId,
        deliveryTimelinessScore: input.deliveryTimelinessScore,
        qualityScore: input.qualityScore,
        pricingScore: input.pricingScore,
        responsivenessScore: input.responsivenessScore,
        overallScore: overall,
        comments: input.comments,
        ratedBy,
        ratedAt: new Date(),
      },
    });
    const avg = await this.prisma.vendorPerformanceRating.aggregate({
      where: { vendorId },
      _avg: { overallScore: true },
    });
    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { performanceScore: avg._avg.overallScore ?? overall },
    });
    return rating;
  }

  async listRatings(vendorId: string) {
    await this.findById(vendorId);
    return this.prisma.vendorPerformanceRating.findMany({
      where: { vendorId },
      orderBy: { ratedAt: 'desc' },
    });
  }

  assertAvailable(vendor: { status: VendorStatus }) {
    if (vendor.status === 'blacklisted' || vendor.status === 'inactive') {
      throw DomainException.withCode(
        ErrorCode.VENDOR_UNAVAILABLE,
        422,
        'Vendor is not available for procurement',
      );
    }
  }
}
