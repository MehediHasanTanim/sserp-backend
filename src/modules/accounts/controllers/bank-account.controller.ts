import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BankAccountType } from '@prisma/client';
import { Roles } from '../../../shared/decorators';
import { DomainException } from '../../../shared/errors/domain-exception';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/bank-accounts')
export class BankAccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('accountant', 'super_admin')
  list() {
    return this.prisma.bankAccount.findMany({
      where: { isActive: true },
      include: { coaAccount: true },
    });
  }

  @Get(':id')
  @Roles('accountant', 'super_admin')
  async get(@Param('id') id: string) {
    const row = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: { coaAccount: true },
    });
    if (!row) throw DomainException.notFound('Bank account not found');
    return row;
  }

  @Post()
  @Roles('accountant', 'super_admin')
  create(
    @Body()
    dto: {
      accountName: string;
      accountNumber: string;
      bankName: string;
      branch?: string;
      accountType: BankAccountType;
      coaAccountId: string;
      openingBalance?: number;
      currencyCode?: string;
    },
  ) {
    return this.prisma.bankAccount.create({ data: dto });
  }

  @Patch(':id')
  @Roles('accountant', 'super_admin')
  update(
    @Param('id') id: string,
    @Body() dto: { accountName?: string; branch?: string; isActive?: boolean },
  ) {
    return this.prisma.bankAccount.update({ where: { id }, data: dto });
  }
}
