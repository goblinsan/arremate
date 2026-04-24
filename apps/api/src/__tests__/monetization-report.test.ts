import { describe, it, expect } from 'vitest';
import {
  computeMonetizationMetrics,
  computeIncentiveMetrics,
} from '../services/monetization-report.js';
import type { OrderSlice, RefundSlice } from '../services/monetization-report.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<OrderSlice> = {}): OrderSlice {
  return {
    totalCents: 10_000,
    subtotalCents: 10_000,
    commissionBps: 1000,
    commissionCents: 1000,
    processorFeeBps: 250,
    processorFeeCents: 250,
    shippingCents: 0,
    buyerTotalCents: 10_000,
    sellerPayoutCents: 8_750,
    promotionCode: null,
    promotionDiscountBps: null,
    sellerOverrideApplied: false,
    configCommissionBps: 1000,
    ...overrides,
  };
}

function makeRefund(overrides: Partial<RefundSlice> = {}): RefundSlice {
  return {
    refundAmountCents: 10_000,
    commissionReversalCents: 1000,
    processorFeeReversalCents: 250,
    sellerClawbackCents: 8_750,
    ...overrides,
  };
}

// ─── computeMonetizationMetrics ───────────────────────────────────────────────

describe('computeMonetizationMetrics – empty input', () => {
  it('returns zeros when no orders or refunds are given', () => {
    const result = computeMonetizationMetrics([], []);

    expect(result.orderCount).toBe(0);
    expect(result.gmvCents).toBe(0);
    expect(result.grossCommissionCents).toBe(0);
    expect(result.netRevenueCents).toBe(0);
    expect(result.effectiveTakeRateBps).toBe(0);
  });
});

describe('computeMonetizationMetrics – single order, no refunds', () => {
  it('computes GMV, commission, processor fee, and net revenue', () => {
    const result = computeMonetizationMetrics([makeOrder()], []);

    expect(result.orderCount).toBe(1);
    expect(result.ordersWithSnapshotCount).toBe(1);
    expect(result.gmvCents).toBe(10_000);
    expect(result.grossCommissionCents).toBe(1000);
    expect(result.processorFeeTotalCents).toBe(250);
    expect(result.netRevenueCents).toBe(750); // 1000 - 250
    expect(result.refundAmountCents).toBe(0);
    expect(result.adjustedCommissionCents).toBe(1000);
    expect(result.adjustedNetRevenueCents).toBe(750);
    // take rate = 1000 / 10000 * 10000 bps = 1000 bps (10%)
    expect(result.effectiveTakeRateBps).toBe(1000);
  });
});

describe('computeMonetizationMetrics – orders without fee snapshot', () => {
  it('excludes legacy orders from aggregations but counts them', () => {
    const withSnapshot = makeOrder();
    const withoutSnapshot = makeOrder({ sellerPayoutCents: null });

    const result = computeMonetizationMetrics([withSnapshot, withoutSnapshot], []);

    expect(result.orderCount).toBe(2);
    expect(result.ordersWithSnapshotCount).toBe(1);
    expect(result.gmvCents).toBe(10_000); // only the order with snapshot
  });
});

describe('computeMonetizationMetrics – refund impact', () => {
  it('subtracts refunds from adjusted figures', () => {
    const order = makeOrder();
    const refund = makeRefund({
      refundAmountCents: 5_000,
      commissionReversalCents: 500,
      processorFeeReversalCents: 125,
      sellerClawbackCents: 4_375,
    });

    const result = computeMonetizationMetrics([order], [refund]);

    expect(result.refundAmountCents).toBe(5_000);
    expect(result.commissionReversedCents).toBe(500);
    expect(result.processorFeeReversedCents).toBe(125);
    expect(result.adjustedCommissionCents).toBe(500); // 1000 - 500
    // adjusted net = 500 - (250 - 125) = 375
    expect(result.adjustedNetRevenueCents).toBe(375);
  });

  it('effective take rate uses adjusted commission', () => {
    const order = makeOrder();
    const fullRefund = makeRefund();

    const result = computeMonetizationMetrics([order], [fullRefund]);

    // After full refund, adjusted commission = 0
    expect(result.adjustedCommissionCents).toBe(0);
    expect(result.effectiveTakeRateBps).toBe(0);
  });
});

describe('computeMonetizationMetrics – shipping subsidy', () => {
  it('captures shippingCents from fee snapshot', () => {
    const order = makeOrder({ shippingCents: 1500, buyerTotalCents: 11_500 });

    const result = computeMonetizationMetrics([order], []);

    expect(result.shippingSubsidyCents).toBe(1500);
    expect(result.totalBuyerSpendCents).toBe(11_500);
  });
});

describe('computeMonetizationMetrics – multiple orders', () => {
  it('sums metrics across multiple orders', () => {
    const orders = [makeOrder(), makeOrder({ subtotalCents: 20_000, commissionCents: 2000, processorFeeCents: 500, sellerPayoutCents: 17_500, buyerTotalCents: 20_000 })];

    const result = computeMonetizationMetrics(orders, []);

    expect(result.orderCount).toBe(2);
    expect(result.gmvCents).toBe(30_000);
    expect(result.grossCommissionCents).toBe(3000);
    expect(result.processorFeeTotalCents).toBe(750);
    expect(result.netRevenueCents).toBe(2250);
  });
});

// ─── computeIncentiveMetrics ──────────────────────────────────────────────────

describe('computeIncentiveMetrics – empty input', () => {
  it('returns zeros when no orders are given', () => {
    const result = computeIncentiveMetrics([]);

    expect(result.overrideOrderCount).toBe(0);
    expect(result.promotionOrderCount).toBe(0);
    expect(result.totalIncentiveWaivedCents).toBe(0);
    expect(result.topPromotions).toHaveLength(0);
  });
});

describe('computeIncentiveMetrics – seller override', () => {
  it('computes waived commission when override rate is lower than config rate', () => {
    // Standard rate: 10%, override rate: 5%
    const order = makeOrder({
      commissionBps: 500,
      commissionCents: 500,
      sellerOverrideApplied: true,
      configCommissionBps: 1000,
    });

    const result = computeIncentiveMetrics([order]);

    expect(result.overrideOrderCount).toBe(1);
    expect(result.overrideActualCommissionCents).toBe(500);
    expect(result.overrideStandardCommissionCents).toBe(1000); // 10% of 10000
    expect(result.commissionWaivedByOverridesCents).toBe(500);
  });

  it('does not produce negative waived amounts when override exceeds config', () => {
    // Override rate higher than config (should not happen in practice but defensively handled)
    const order = makeOrder({
      commissionBps: 1500,
      commissionCents: 1500,
      sellerOverrideApplied: true,
      configCommissionBps: 1000,
    });

    const result = computeIncentiveMetrics([order]);

    expect(result.commissionWaivedByOverridesCents).toBe(0);
  });

  it('handles full waiver override (commissionBps = 0)', () => {
    const order = makeOrder({
      commissionBps: 0,
      commissionCents: 0,
      sellerOverrideApplied: true,
      sellerPayoutCents: 9_750,
      configCommissionBps: 1000,
    });

    const result = computeIncentiveMetrics([order]);

    expect(result.commissionWaivedByOverridesCents).toBe(1000); // full 10% waived
  });
});

describe('computeIncentiveMetrics – promotions', () => {
  it('computes waived commission from promotion discount', () => {
    const order = makeOrder({
      promotionCode: 'LAUNCH50',
      promotionDiscountBps: 500,   // 5% discount
      commissionBps: 500,          // effective rate after discount
      commissionCents: 500,
    });

    const result = computeIncentiveMetrics([order]);

    expect(result.promotionOrderCount).toBe(1);
    // 5% of 10000 = 500
    expect(result.commissionWaivedByPromotionsCents).toBe(500);
    expect(result.topPromotions).toHaveLength(1);
    expect(result.topPromotions[0].code).toBe('LAUNCH50');
    expect(result.topPromotions[0].usageCount).toBe(1);
    expect(result.topPromotions[0].commissionWaivedCents).toBe(500);
  });

  it('aggregates multiple uses of the same promotion code', () => {
    const orders = [
      makeOrder({ promotionCode: 'PROMO10', promotionDiscountBps: 200, commissionBps: 800, commissionCents: 800 }),
      makeOrder({ promotionCode: 'PROMO10', promotionDiscountBps: 200, commissionBps: 800, commissionCents: 800 }),
    ];

    const result = computeIncentiveMetrics(orders);

    expect(result.topPromotions[0].usageCount).toBe(2);
    expect(result.topPromotions[0].commissionWaivedCents).toBe(400); // 2 * 200
  });

  it('sorts top promotions by commission waived descending', () => {
    const orders = [
      makeOrder({ promotionCode: 'SMALL', promotionDiscountBps: 100, commissionBps: 900, commissionCents: 900 }),
      makeOrder({ promotionCode: 'BIG', promotionDiscountBps: 800, commissionBps: 200, commissionCents: 200 }),
    ];

    const result = computeIncentiveMetrics(orders);

    expect(result.topPromotions[0].code).toBe('BIG');
    expect(result.topPromotions[1].code).toBe('SMALL');
  });
});

describe('computeIncentiveMetrics – combined overrides and promotions', () => {
  it('sums total incentive waived across both buckets', () => {
    const overrideOrder = makeOrder({
      sellerOverrideApplied: true,
      commissionBps: 500,
      commissionCents: 500,
      configCommissionBps: 1000,
    });
    const promoOrder = makeOrder({
      promotionCode: 'DEAL',
      promotionDiscountBps: 300,
      commissionBps: 700,
      commissionCents: 700,
    });

    const result = computeIncentiveMetrics([overrideOrder, promoOrder]);

    // Override waiver: 1000 - 500 = 500
    // Promo waiver: 300 bps of 10000 = 300
    expect(result.commissionWaivedByOverridesCents).toBe(500);
    expect(result.commissionWaivedByPromotionsCents).toBe(300);
    expect(result.totalIncentiveWaivedCents).toBe(800);
  });
});

describe('computeIncentiveMetrics – excludes orders without snapshot', () => {
  it('does not count override/promo orders that lack a fee snapshot', () => {
    const noSnapshot = makeOrder({
      sellerPayoutCents: null,
      sellerOverrideApplied: true,
      promotionCode: 'UNUSED',
    });

    const result = computeIncentiveMetrics([noSnapshot]);

    expect(result.overrideOrderCount).toBe(0);
    expect(result.promotionOrderCount).toBe(0);
    expect(result.totalIncentiveWaivedCents).toBe(0);
  });
});
