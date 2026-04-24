import { describe, it, expect } from 'vitest';
import { calculateRefund } from '../services/refund-policy.js';
import type { OrderFeeSnapshot } from '../services/refund-policy.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const defaultSnapshot: OrderFeeSnapshot = {
  totalCents: 10_000,
  buyerTotalCents: 10_000,
  commissionCents: 1_000,   // 10%
  processorFeeCents: 250,   // 2.5%
  sellerPayoutCents: 8_750, // 10000 - 1000 - 250
  shippingCents: 0,
};

const snapshotWithShipping: OrderFeeSnapshot = {
  totalCents: 10_000,
  buyerTotalCents: 11_500, // R$ 15.00 shipping added
  commissionCents: 1_000,
  processorFeeCents: 250,
  sellerPayoutCents: 8_750,
  shippingCents: 1_500,
};

// ─── Full refund ──────────────────────────────────────────────────────────────

describe('calculateRefund – full refund', () => {
  it('returns full buyer total and reverses all fees', () => {
    const result = calculateRefund({ snapshot: defaultSnapshot });

    expect(result.refundType).toBe('FULL');
    expect(result.refundAmountCents).toBe(10_000);
    expect(result.commissionReversalCents).toBe(1_000);
    expect(result.processorFeeReversalCents).toBe(250);
    expect(result.sellerClawbackCents).toBe(8_750);
    expect(result.payoutOffsetCents).toBe(8_750);
  });

  it('satisfies the accounting identity for full refund', () => {
    const result = calculateRefund({ snapshot: defaultSnapshot });
    expect(
      result.commissionReversalCents + result.processorFeeReversalCents + result.sellerClawbackCents,
    ).toBe(result.refundAmountCents);
  });

  it('includes shipping in the full refund amount', () => {
    const result = calculateRefund({ snapshot: snapshotWithShipping });

    expect(result.refundType).toBe('FULL');
    expect(result.refundAmountCents).toBe(11_500);
    // Commission and processor fee are only on the subtotal, not shipping
    expect(result.commissionReversalCents).toBe(1_000);
    expect(result.processorFeeReversalCents).toBe(250);
    expect(result.sellerClawbackCents).toBe(8_750);
  });

  it('treats an explicit amountCents equal to buyerTotalCents as a full refund', () => {
    const result = calculateRefund({ snapshot: defaultSnapshot, refundAmountCents: 10_000 });
    expect(result.refundType).toBe('FULL');
  });

  it('handles zero fees (commission and processor both 0)', () => {
    const zeroFeeSnapshot: OrderFeeSnapshot = {
      ...defaultSnapshot,
      commissionCents: 0,
      processorFeeCents: 0,
      sellerPayoutCents: 10_000,
    };
    const result = calculateRefund({ snapshot: zeroFeeSnapshot });
    expect(result.commissionReversalCents).toBe(0);
    expect(result.processorFeeReversalCents).toBe(0);
    expect(result.sellerClawbackCents).toBe(10_000);
    expect(result.refundAmountCents).toBe(10_000);
  });
});

// ─── Partial refund ───────────────────────────────────────────────────────────

describe('calculateRefund – partial refund', () => {
  it('pro-rates fees for a 50% partial refund', () => {
    const result = calculateRefund({ snapshot: defaultSnapshot, refundAmountCents: 5_000 });

    expect(result.refundType).toBe('PARTIAL');
    expect(result.refundAmountCents).toBe(5_000);
    // 50% of 1000 = 500, 50% of 250 = 125, seller clawback = 5000 - 500 - 125 = 4375
    expect(result.commissionReversalCents).toBe(500);
    expect(result.processorFeeReversalCents).toBe(125);
    expect(result.sellerClawbackCents).toBe(4_375);
    expect(result.payoutOffsetCents).toBe(4_375);
  });

  it('satisfies the accounting identity for partial refund', () => {
    const result = calculateRefund({ snapshot: defaultSnapshot, refundAmountCents: 3_333 });
    expect(
      result.commissionReversalCents + result.processorFeeReversalCents + result.sellerClawbackCents,
    ).toBe(result.refundAmountCents);
  });

  it('handles a minimal one-cent refund', () => {
    const result = calculateRefund({ snapshot: defaultSnapshot, refundAmountCents: 1 });
    expect(result.refundType).toBe('PARTIAL');
    expect(result.refundAmountCents).toBe(1);
    // commission reversal = round(1000 * 0.0001) = 0
    // processor fee reversal = round(250 * 0.0001) = 0
    // seller clawback = 1 - 0 - 0 = 1
    expect(
      result.commissionReversalCents + result.processorFeeReversalCents + result.sellerClawbackCents,
    ).toBe(1);
  });

  it('satisfies accounting identity for non-round amounts', () => {
    for (const amount of [1, 99, 1234, 7777, 9999]) {
      const result = calculateRefund({ snapshot: defaultSnapshot, refundAmountCents: amount });
      expect(
        result.commissionReversalCents + result.processorFeeReversalCents + result.sellerClawbackCents,
        `amount=${amount}`,
      ).toBe(result.refundAmountCents);
    }
  });

  it('partial refund with shipping snapshot satisfies accounting identity', () => {
    const result = calculateRefund({ snapshot: snapshotWithShipping, refundAmountCents: 5_750 });
    expect(
      result.commissionReversalCents + result.processorFeeReversalCents + result.sellerClawbackCents,
    ).toBe(5_750);
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe('calculateRefund – input validation', () => {
  it('throws when refundAmountCents is zero', () => {
    expect(() => calculateRefund({ snapshot: defaultSnapshot, refundAmountCents: 0 })).toThrow();
  });

  it('throws when refundAmountCents exceeds buyerTotalCents', () => {
    expect(() =>
      calculateRefund({ snapshot: defaultSnapshot, refundAmountCents: 10_001 }),
    ).toThrow();
  });

  it('falls back to totalCents when buyerTotalCents is 0', () => {
    const snapshot: OrderFeeSnapshot = { ...defaultSnapshot, buyerTotalCents: 0 };
    const result = calculateRefund({ snapshot });
    // Should use totalCents (10000) as the reference total
    expect(result.refundType).toBe('FULL');
    expect(result.refundAmountCents).toBe(10_000);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('calculateRefund – determinism', () => {
  it('produces identical output for identical input', () => {
    const params = { snapshot: defaultSnapshot, refundAmountCents: 4_000 };
    const r1 = calculateRefund(params);
    const r2 = calculateRefund(params);
    expect(r1).toEqual(r2);
  });
});
