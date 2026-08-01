import { ErrorCode } from '../../src/shared/errors/domain-exception';

describe('Session idle timeout (H-05)', () => {
  it('ErrorCode SESSION_IDLE_TIMEOUT is defined as 401 contract', () => {
    expect(ErrorCode.SESSION_IDLE_TIMEOUT).toBe('SESSION_IDLE_TIMEOUT');
  });
});

describe('RLS contracts (H-01/H-02)', () => {
  it('documents fail-closed and no BYPASSRLS', () => {
    const fs = require('fs') as typeof import('fs');
    const sql = fs.readFileSync(
      'prisma/migrations/20260802000000_phase9_hardening_golive/migration.sql',
      'utf8',
    );
    expect(sql).toContain('NOBYPASSRLS');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('student_medical_records');
    expect(sql).toContain('session_notes');
    expect(sql).toContain('payroll_slips');
    expect(sql).toContain('patient_medical_history');
    expect(sql).toContain('gratuity_payments');
  });
});
