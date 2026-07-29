export class Money {
  constructor(
    public readonly amountMinor: number,
    public readonly currencyCode = 'BDT',
    public readonly minorUnits = 2,
  ) {
    if (!Number.isInteger(amountMinor)) {
      throw new Error('Money amount must be an integer in minor units');
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(
      this.amountMinor + other.amountMinor,
      this.currencyCode,
      this.minorUnits,
    );
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(
      this.amountMinor - other.amountMinor,
      this.currencyCode,
      this.minorUnits,
    );
  }

  /** Allocate amount across n parts without rounding loss (largest remainder). */
  allocate(parts: number): Money[] {
    if (parts <= 0) throw new Error('parts must be > 0');
    const base = Math.floor(this.amountMinor / parts);
    const remainder = this.amountMinor % parts;
    return Array.from(
      { length: parts },
      (_, i) =>
        new Money(
          base + (i < remainder ? 1 : 0),
          this.currencyCode,
          this.minorUnits,
        ),
    );
  }

  format(): string {
    const factor = 10 ** this.minorUnits;
    const major = (this.amountMinor / factor).toFixed(this.minorUnits);
    return `${this.currencyCode} ${major}`;
  }

  private assertSameCurrency(other: Money) {
    if (
      other.currencyCode !== this.currencyCode ||
      other.minorUnits !== this.minorUnits
    ) {
      throw new Error('Currency mismatch');
    }
  }
}
