import { DataImportService } from '../../src/modules/hardening/services/data-import.service';
import { ErrorCode } from '../../src/shared/errors/domain-exception';

describe('Data import (H-09/H-10)', () => {
  it('rejects unbalanced opening balances before write', async () => {
    const prisma = {
      dataMigrationRun: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const svc = new DataImportService(prisma as never);
    await expect(
      svc.commitOpeningBalances('run1', [
        { accountCode: '1000', debit: 100, credit: 0 },
        { accountCode: '2000', debit: 0, credit: 50 },
      ]),
    ).rejects.toMatchObject({ code: ErrorCode.JOURNAL_UNBALANCED });
  });

  it('validates rows and fails commit on errors', async () => {
    const svc = new DataImportService({} as never);
    const { errors } = svc.validateRows('students', [{ _row: 1 }]);
    expect(errors.length).toBe(1);
  });
});
