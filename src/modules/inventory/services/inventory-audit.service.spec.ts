import { ErrorCode } from '../../../shared/errors/domain-exception';
import {
  classifyAuditDiscrepancy,
  validateAuditSubmit,
  validateAuditSignOff,
} from './inventory-audit.service';

describe('InventoryAuditService rules', () => {
  describe('classifyAuditDiscrepancy (IA-04)', () => {
    it('classifies match at zero difference', () => {
      expect(classifyAuditDiscrepancy(10, 10, 100)).toEqual({
        differenceQuantity: 0,
        differenceValue: 0,
        discrepancyType: 'match',
      });
    });

    it('classifies surplus when physical exceeds system', () => {
      const r = classifyAuditDiscrepancy(10, 12, 500);
      expect(r.discrepancyType).toBe('surplus');
      expect(r.differenceQuantity).toBe(2);
      expect(r.differenceValue).toBe(1000);
    });

    it('classifies shortage when physical is below system', () => {
      const r = classifyAuditDiscrepancy(10, 7, 200);
      expect(r.discrepancyType).toBe('shortage');
      expect(r.differenceQuantity).toBe(-3);
      expect(r.differenceValue).toBe(-600);
    });
  });

  describe('validateAuditSubmit (IA-03)', () => {
    it('rejects submit when any line lacks physical count', () => {
      const result = validateAuditSubmit([
        {
          id: '1',
          systemQuantity: 5,
          physicalQuantity: 5,
          unitCost: 100,
          discrepancyType: null,
          explanation: null,
        },
        {
          id: '2',
          systemQuantity: 3,
          physicalQuantity: null,
          unitCost: 100,
          discrepancyType: null,
          explanation: null,
        },
      ]);
      expect(result.ok).toBe(false);
      expect(result.missingCount).toBe(1);
    });

    it('allows submit when all lines counted', () => {
      expect(
        validateAuditSubmit([
          {
            id: '1',
            systemQuantity: 5,
            physicalQuantity: 4,
            unitCost: 100,
            discrepancyType: null,
            explanation: null,
          },
        ]).ok,
      ).toBe(true);
    });
  });

  describe('validateAuditSignOff (IA-06/07)', () => {
    it('blocks sign-off on already signed-off audit', () => {
      const r = validateAuditSignOff({
        status: 'signed_off',
        lines: [],
        correctiveActions: [],
      });
      expect(r.ok).toBe(false);
      expect(r.code).toBe(ErrorCode.AUDIT_SIGNED_OFF);
    });

    it('requires explanation or corrective action for shortages', () => {
      const r = validateAuditSignOff({
        status: 'reviewed',
        lines: [
          {
            id: 'line-1',
            systemQuantity: 10,
            physicalQuantity: 8,
            unitCost: 100,
            discrepancyType: 'shortage',
            explanation: null,
          },
        ],
        correctiveActions: [],
      });
      expect(r.ok).toBe(false);
      expect(r.code).toBe(ErrorCode.EXPLANATION_REQUIRED);
    });

    it('allows sign-off when shortage has explanation', () => {
      const r = validateAuditSignOff({
        status: 'reviewed',
        lines: [
          {
            id: 'line-1',
            systemQuantity: 10,
            physicalQuantity: 8,
            unitCost: 100,
            discrepancyType: 'shortage',
            explanation: 'Damaged units discarded',
          },
        ],
        correctiveActions: [],
      });
      expect(r.ok).toBe(true);
    });

    it('allows sign-off when shortage has corrective action', () => {
      const r = validateAuditSignOff({
        status: 'counted',
        lines: [
          {
            id: 'line-1',
            systemQuantity: 10,
            physicalQuantity: 8,
            unitCost: 100,
            discrepancyType: 'shortage',
            explanation: null,
          },
        ],
        correctiveActions: [{ auditLineId: 'line-1', status: 'open' }],
      });
      expect(r.ok).toBe(true);
    });
  });
});
