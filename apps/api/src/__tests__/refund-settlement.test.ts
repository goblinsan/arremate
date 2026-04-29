import { describe, it, expect } from 'vitest';
import { calculateRefund } from '../services/refund-policy.js';
import type { OrderFeeSnapshot } from '../services/refund-policy.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const defaultSnapshot: OrderFeeSnapshot = {
  totalCents: 10_000,
  buyerTotalCents: 10_000,
  commissionCents: 1_000,
  processorFeeCents: 250,
  sellerPayoutCents: 8_750,
  shippingCents: 0,
};

// ─── Settlement offset derivation ─────────────────────────────────────────────
//
// These tests verify the business logic used in admin-refunds.ts to derive
// settlement ledger entries from a refund breakdown, without hitting the DB.

function deriveSettlementOffset(payoutOffsetCents: number) {
  return payoutOffsetCents > 0 ? -payoutOffsetCents : 0;
}

describe('refund settlement offset derivation', () => {
  it('full refund produces a negative offset equal to sellerPayoutCents', () => {
    const breakdown = calculateRefund({ snapshot: defaultSnapshot });
    const offsetCents = deriveSettlementOffset(breakdown.payoutOffsetCents);

    expect(breakdown.payoutOffsetCents).toBe(8_750);
    expect(offsetCents).toBe(-8_750);
  });

  it('partial refund produces a proportional negative offset', () => {
    const breakdown = calculateRefund({ snapshot: defaultSnapshot, refundAmountCents: 5_000 });
    const offsetCents = deriveSettlementOffset(breakdown.payoutOffsetCents);

    expect(breakdown.payoutOffsetCents).toBe(4_375);
    expect(offsetCents).toBe(-4_375);
  });

  it('zero-payout-offset order does not create a ledger entry', () => {
    // Simulate an order where all payout was already offset
    const zeroPayoutSnapshot: OrderFeeSnapshot = {
      ...defaultSnapshot,
      sellerPayoutCents: 0,
      commissionCents: 10_000,
      processorFeeCents: 0,
    };
    const breakdown = calculateRefund({ snapshot: zeroPayoutSnapshot });
    const offsetCents = deriveSettlementOffset(breakdown.payoutOffsetCents);

    expect(breakdown.payoutOffsetCents).toBe(0);
    expect(offsetCents).toBe(0);
  });
});

// ─── Payable OFFSET logic ─────────────────────────────────────────────────────
//
// Verifies the rule: a PENDING payable is marked OFFSET on a full refund but
// left untouched for partial refunds (because the order remains PAID).

function shouldOffsetPayable(
  isFullRefund: boolean,
  payableStatus: 'PENDING' | 'INCLUDED_IN_BATCH' | 'PAID' | 'OFFSET' | null,
): boolean {
  return isFullRefund && payableStatus === 'PENDING';
}

describe('payable OFFSET eligibility', () => {
  it('full refund with PENDING payable should be marked OFFSET', () => {
    const breakdown = calculateRefund({ snapshot: defaultSnapshot });
    expect(shouldOffsetPayable(breakdown.refundType === 'FULL', 'PENDING')).toBe(true);
  });

  it('partial refund should NOT offset the payable', () => {
    const breakdown = calculateRefund({ snapshot: defaultSnapshot, refundAmountCents: 5_000 });
    expect(shouldOffsetPayable(breakdown.refundType === 'FULL', 'PENDING')).toBe(false);
  });

  it('full refund with already-batched payable should NOT be re-offset', () => {
    const breakdown = calculateRefund({ snapshot: defaultSnapshot });
    expect(shouldOffsetPayable(breakdown.refundType === 'FULL', 'INCLUDED_IN_BATCH')).toBe(false);
  });

  it('full refund with no payable should not attempt to offset', () => {
    const breakdown = calculateRefund({ snapshot: defaultSnapshot });
    expect(shouldOffsetPayable(breakdown.refundType === 'FULL', null)).toBe(false);
  });
});

// ─── Batch netting with refund offset entries ─────────────────────────────────

interface PayableSlice { id: string; sellerId: string; amountCents: number }
interface LedgerSlice { id: string; sellerId: string; amountCents: number; description: string | null }

function computeBatchTotals(payables: PayableSlice[], ledgerEntries: LedgerSlice[]) {
  const totalCents =
    payables.reduce((s, p) => s + p.amountCents, 0) +
    ledgerEntries.reduce((s, e) => s + e.amountCents, 0);
  const sellerIds = new Set([...payables.map((p) => p.sellerId), ...ledgerEntries.map((e) => e.sellerId)]);
  return { totalCents, sellerCount: sellerIds.size };
}

describe('batch netting with refund offset entries', () => {
  it('refund offset entry reduces net payout total', () => {
    const payables: PayableSlice[] = [{ id: 'p1', sellerId: 's1', amountCents: 8_750 }];
    // New order payout after a refund offset from a previous order
    const ledger: LedgerSlice[] = [{ id: 'l1', sellerId: 's1', amountCents: -8_750, description: 'Estorno de reembolso' }];

    const result = computeBatchTotals(payables, ledger);

    expect(result.totalCents).toBe(0); // fully netted
    expect(result.sellerCount).toBe(1);
  });

  it('partial offset reduces payout proportionally', () => {
    const payables: PayableSlice[] = [{ id: 'p1', sellerId: 's1', amountCents: 10_000 }];
    const ledger: LedgerSlice[] = [{ id: 'l1', sellerId: 's1', amountCents: -4_375, description: 'Estorno de reembolso' }];

    const result = computeBatchTotals(payables, ledger);

    expect(result.totalCents).toBe(5_625);
  });

  it('offset for one seller does not affect another seller', () => {
    const payables: PayableSlice[] = [
      { id: 'p1', sellerId: 's1', amountCents: 8_000 },
      { id: 'p2', sellerId: 's2', amountCents: 5_000 },
    ];
    const ledger: LedgerSlice[] = [{ id: 'l1', sellerId: 's1', amountCents: -3_000, description: 'Estorno de reembolso' }];

    const result = computeBatchTotals(payables, ledger);

    expect(result.totalCents).toBe(10_000); // 8000 - 3000 + 5000
    expect(result.sellerCount).toBe(2);
  });
});
