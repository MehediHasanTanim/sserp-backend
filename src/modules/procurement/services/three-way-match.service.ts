/**
 * Pure three-way match (TW-01–TW-03).
 */

export interface MatchLineInput {
  poUnitPrice: number;
  acceptedQuantity: number;
  invoicedQuantity: number;
  invoicedUnitPrice: number;
}

export type MatchStatus =
  'matched' | 'variance_within_tolerance' | 'variance_exceeded' | 'unmatched';

export interface MatchResult {
  matchedAmount: number;
  invoiceTotal: number;
  varianceAmount: number;
  matchStatus: MatchStatus;
  blocked: boolean;
  blockReason?: string;
  lineStatuses: MatchStatus[];
}

export class ThreeWayMatchService {
  match(lines: MatchLineInput[], tolerancePercent: number): MatchResult {
    let matchedAmount = 0;
    let invoiceTotal = 0;
    const lineStatuses: MatchStatus[] = [];
    let blocked = false;
    let blockReason: string | undefined;

    for (const line of lines) {
      if (line.invoicedQuantity > line.acceptedQuantity + 1e-9) {
        blocked = true;
        blockReason = 'EXCEEDS_ACCEPTED_QUANTITY';
        lineStatuses.push('variance_exceeded');
        invoiceTotal += Math.round(
          line.invoicedQuantity * line.invoicedUnitPrice,
        );
        continue;
      }
      const qty = Math.min(line.acceptedQuantity, line.invoicedQuantity);
      matchedAmount += Math.round(qty * line.poUnitPrice);
      invoiceTotal += Math.round(
        line.invoicedQuantity * line.invoicedUnitPrice,
      );

      const lineInvoice = Math.round(
        line.invoicedQuantity * line.invoicedUnitPrice,
      );
      const lineMatched = Math.round(qty * line.poUnitPrice);
      const lineVar = lineInvoice - lineMatched;
      const base = lineMatched === 0 ? lineInvoice : lineMatched;
      const pct =
        base === 0
          ? lineVar === 0
            ? 0
            : 100
          : Math.abs((lineVar / base) * 100);

      if (lineVar === 0) lineStatuses.push('matched');
      else if (pct <= tolerancePercent)
        lineStatuses.push('variance_within_tolerance');
      else lineStatuses.push('variance_exceeded');
    }

    const varianceAmount = invoiceTotal - matchedAmount;
    const base = matchedAmount === 0 ? invoiceTotal : matchedAmount;
    const pct =
      base === 0
        ? varianceAmount === 0
          ? 0
          : 100
        : Math.abs((varianceAmount / base) * 100);

    let matchStatus: MatchStatus = 'matched';
    if (
      lineStatuses.some((s) => s === 'variance_exceeded') ||
      pct > tolerancePercent
    ) {
      matchStatus = 'variance_exceeded';
    } else if (
      lineStatuses.some((s) => s === 'variance_within_tolerance') ||
      varianceAmount !== 0
    ) {
      matchStatus = 'variance_within_tolerance';
    } else if (lines.length === 0) {
      matchStatus = 'unmatched';
    }

    if (matchStatus === 'variance_exceeded' && !blocked) {
      blocked = true;
      blockReason = 'INVOICE_VARIANCE_EXCEEDED';
    }

    return {
      matchedAmount,
      invoiceTotal,
      varianceAmount,
      matchStatus,
      blocked,
      blockReason,
      lineStatuses,
    };
  }
}
