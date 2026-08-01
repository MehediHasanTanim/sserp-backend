import { ThreeWayMatchService } from './three-way-match.service';

describe('ThreeWayMatchService', () => {
  const svc = new ThreeWayMatchService();

  it('exact match', () => {
    const r = svc.match(
      [
        {
          poUnitPrice: 1000,
          acceptedQuantity: 10,
          invoicedQuantity: 10,
          invoicedUnitPrice: 1000,
        },
      ],
      2,
    );
    expect(r.matchStatus).toBe('matched');
    expect(r.varianceAmount).toBe(0);
    expect(r.blocked).toBe(false);
  });

  it('invoice qty below accepted → negative variance within tolerance', () => {
    const r = svc.match(
      [
        {
          poUnitPrice: 1000,
          acceptedQuantity: 10,
          invoicedQuantity: 9,
          invoicedUnitPrice: 1000,
        },
      ],
      15,
    );
    expect(r.matchedAmount).toBe(9000);
    expect(r.invoiceTotal).toBe(9000);
    expect(r.blocked).toBe(false);
  });

  it('price 1% above → within tolerance', () => {
    const r = svc.match(
      [
        {
          poUnitPrice: 10000,
          acceptedQuantity: 1,
          invoicedQuantity: 1,
          invoicedUnitPrice: 10100,
        },
      ],
      2,
    );
    expect(r.matchStatus).toBe('variance_within_tolerance');
    expect(r.blocked).toBe(false);
  });

  it('price 5% above → exceeded', () => {
    const r = svc.match(
      [
        {
          poUnitPrice: 10000,
          acceptedQuantity: 1,
          invoicedQuantity: 1,
          invoicedUnitPrice: 10500,
        },
      ],
      2,
    );
    expect(r.matchStatus).toBe('variance_exceeded');
    expect(r.blocked).toBe(true);
    expect(r.blockReason).toBe('INVOICE_VARIANCE_EXCEEDED');
  });

  it('invoice qty above accepted always blocked', () => {
    const r = svc.match(
      [
        {
          poUnitPrice: 1000,
          acceptedQuantity: 5,
          invoicedQuantity: 6,
          invoicedUnitPrice: 1000,
        },
      ],
      50,
    );
    expect(r.blocked).toBe(true);
    expect(r.blockReason).toBe('EXCEEDS_ACCEPTED_QUANTITY');
  });

  it('multi-line worst status wins', () => {
    const r = svc.match(
      [
        {
          poUnitPrice: 1000,
          acceptedQuantity: 1,
          invoicedQuantity: 1,
          invoicedUnitPrice: 1000,
        },
        {
          poUnitPrice: 1000,
          acceptedQuantity: 1,
          invoicedQuantity: 1,
          invoicedUnitPrice: 1100,
        },
      ],
      2,
    );
    expect(r.matchStatus).toBe('variance_exceeded');
  });
});
