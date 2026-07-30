import { TaxService } from './tax.service';

describe('TaxService', () => {
  const service = new TaxService({} as any);

  it('TX-01: inclusive decomposition preserves gross exactly across amounts', () => {
    for (const gross of [1000, 1, 15, 999, 12345, 7, 100, 250, 333, 1000001]) {
      const { base, tax } = service.decomposeInclusive(gross, 15);
      expect(base + tax).toBe(gross);
      expect(base).toBeGreaterThanOrEqual(0);
      expect(tax).toBeGreaterThanOrEqual(0);
    }
  });
});
