import { PdfRendererService } from './pdf-renderer.service';

describe('Payslip PDF rendering (Phase 5 exit)', () => {
  it('renders HTML with gross/net and a non-empty PDF buffer', async () => {
    const renderer = new PdfRendererService();
    const data = {
      slip: {
        slipNumber: 'PSL-TEST-001',
        workingDays: 22,
        presentDays: 22,
        lopDays: 0,
        grossAmount: 5000000,
        totalDeductions: 500000,
        netAmount: 4500000,
        lines: [
          {
            componentName: 'Basic Salary',
            componentType: 'earning',
            amount: 5000000,
          },
          {
            componentName: 'Provident Fund',
            componentType: 'deduction',
            amount: 500000,
          },
        ],
      },
      employee: { fullName: 'Test Employee', employeeCode: 'E001' },
      payrollRun: { periodMonth: 7, periodYear: 2026, runNumber: 1 },
    };

    const html = renderer.renderHtml('payslip', data);
    expect(html).toContain('Gross: 5000000');
    expect(html).toContain('Net: 4500000');
    expect(html).toContain('Basic Salary');

    const result = await renderer.renderPdf({
      templateName: 'payslip',
      data,
    });
    expect(result.mimeType).toBe('application/pdf');
    expect(result.buffer.length).toBeGreaterThan(100);
    expect(result.buffer.toString('latin1')).toContain('%PDF');
  });
});
