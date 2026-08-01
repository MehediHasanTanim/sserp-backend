import { StatementNoteService } from './statement-note.service';

describe('StatementNoteService', () => {
  it('creates and lists notes', async () => {
    const created = {
      id: 'n1',
      fiscalYear: '2025-26',
      statementType: 'balance_sheet',
      noteNumber: 1,
      title: 'Cash',
      body: 'Cash at bank',
    };
    const prisma = {
      financialStatementNote: {
        create: jest.fn().mockResolvedValue(created),
        findMany: jest.fn().mockResolvedValue([created]),
        findUnique: jest.fn().mockResolvedValue(created),
        update: jest.fn().mockResolvedValue({ ...created, title: 'Cash & bank' }),
        delete: jest.fn().mockResolvedValue(created),
      },
    };
    const svc = new StatementNoteService(prisma as any);
    await svc.create(
      {
        fiscalYear: '2025-26',
        statementType: 'balance_sheet',
        noteNumber: 1,
        title: 'Cash',
        body: 'Cash at bank',
      },
      'user1',
    );
    const list = await svc.list('2025-26', 'balance_sheet');
    expect(list).toHaveLength(1);
    await svc.update('n1', { title: 'Cash & bank' });
    await svc.remove('n1');
    expect(prisma.financialStatementNote.delete).toHaveBeenCalledWith({
      where: { id: 'n1' },
    });
  });
});
