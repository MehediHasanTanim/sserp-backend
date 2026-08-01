import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

export interface CreateStatementNoteDto {
  fiscalYear: string;
  statementType: string;
  noteNumber: number;
  title: string;
  body: string;
}

export type UpdateStatementNoteDto = Partial<
  Omit<CreateStatementNoteDto, 'fiscalYear' | 'statementType'>
> &
  Partial<Pick<CreateStatementNoteDto, 'fiscalYear' | 'statementType'>>;

@Injectable()
export class StatementNoteService {
  constructor(private readonly prisma: PrismaService) {}

  async list(fiscalYear?: string, statementType?: string) {
    return this.prisma.financialStatementNote.findMany({
      where: {
        ...(fiscalYear ? { fiscalYear } : {}),
        ...(statementType ? { statementType } : {}),
      },
      orderBy: [{ fiscalYear: 'desc' }, { statementType: 'asc' }, { noteNumber: 'asc' }],
    });
  }

  async findById(id: string) {
    const note = await this.prisma.financialStatementNote.findUnique({
      where: { id },
    });
    if (!note) throw DomainException.notFound('Statement note not found');
    return note;
  }

  async create(dto: CreateStatementNoteDto, createdBy: string) {
    return this.prisma.financialStatementNote.create({
      data: {
        fiscalYear: dto.fiscalYear,
        statementType: dto.statementType,
        noteNumber: dto.noteNumber,
        title: dto.title,
        body: dto.body,
        createdBy,
      },
    });
  }

  async update(id: string, dto: UpdateStatementNoteDto) {
    await this.findById(id);
    return this.prisma.financialStatementNote.update({
      where: { id },
      data: {
        fiscalYear: dto.fiscalYear,
        statementType: dto.statementType,
        noteNumber: dto.noteNumber,
        title: dto.title,
        body: dto.body,
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.financialStatementNote.delete({ where: { id } });
    return { deleted: true };
  }
}
