describe('RLS bypass attempt contract', () => {
  it('FORCE ROW LEVEL SECURITY is enabled on all five tables', () => {
    const fs = require('fs') as typeof import('fs');
    const sql = fs.readFileSync(
      'prisma/migrations/20260802000000_phase9_hardening_golive/migration.sql',
      'utf8',
    );
    for (const table of [
      'student_medical_records',
      'session_notes',
      'payroll_slips',
      'patient_medical_history',
      'gratuity_payments',
    ]) {
      expect(sql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    }
  });
});
