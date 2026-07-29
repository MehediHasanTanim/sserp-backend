import { Money } from './money';

describe('Money', () => {
  it('adds and subtracts in minor units', () => {
    const a = new Money(1000);
    const b = new Money(250);
    expect(a.add(b).amountMinor).toBe(1250);
    expect(a.subtract(b).amountMinor).toBe(750);
  });

  it('allocates without rounding loss', () => {
    const parts = new Money(100).allocate(3);
    expect(parts.map((p) => p.amountMinor)).toEqual([34, 33, 33]);
    expect(parts.reduce((s, p) => s + p.amountMinor, 0)).toBe(100);
  });

  it('formats with currency', () => {
    expect(new Money(12345).format()).toBe('BDT 123.45');
  });
});
