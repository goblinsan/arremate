import { describe, it, expect } from 'vitest';
import { calculateFee } from '../services/fee-calculator.js';
import { resolveChargeAmount } from '../routes/orders.js';
import type { FeeConfigSnapshot } from '../services/fee-calculator.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const defaultConfig: FeeConfigSnapshot = {
  id: 'cfg-v1',
  version: 1,
  commissionBps: 1000,   // 10%
  processorFeeBps: 250,  // 2.5%
  shippingModel: 'INCLUDED',
  shippingFixedCents: 0,
};

const fixedShippingConfig: FeeConfigSnapshot = {
  ...defaultConfig,
  shippingModel: 'FIXED',
  shippingFixedCents: 1500, // R$ 15.00
};

// ─── Buyer total identity ─────────────────────────────────────────────────────
// buyerTotalCents === subtotalCents + shippingCents

describe('order amount integrity – buyer total identity', () => {
  it('buyerTotal equals subtotal when shipping is INCLUDED (0)', () => {
    const result = calculateFee({ config: defaultConfig, subtotalCents: 10_000, sellerOverride: null, promotion: null });
    expect(result.totalBuyerCents).toBe(result.subtotalCents + result.shippingCents);
    expect(result.totalBuyerCents).toBe(10_000);
  });

  it('buyerTotal equals subtotal plus shipping when FIXED shipping applies', () => {
    const result = calculateFee({ config: fixedShippingConfig, subtotalCents: 10_000, sellerOverride: null, promotion: null });
    expect(result.totalBuyerCents).toBe(result.subtotalCents + result.shippingCents);
    expect(result.totalBuyerCents).toBe(11_500);
    expect(result.shippingCents).toBe(1500);
  });

  it('identity holds for non-round subtotal amounts', () => {
    const result = calculateFee({ config: fixedShippingConfig, subtotalCents: 7777, sellerOverride: null, promotion: null });
    expect(result.totalBuyerCents).toBe(result.subtotalCents + result.shippingCents);
  });

  it('identity holds with zero commission and zero processor fee', () => {
    const freeConfig: FeeConfigSnapshot = { ...defaultConfig, commissionBps: 0, processorFeeBps: 0 };
    const result = calculateFee({ config: freeConfig, subtotalCents: 5000, sellerOverride: null, promotion: null });
    expect(result.totalBuyerCents).toBe(result.subtotalCents + result.shippingCents);
  });
});

// ─── Seller payout identity ───────────────────────────────────────────────────
// sellerPayoutCents === subtotalCents - commissionCents - processorFeeCents

describe('order amount integrity – seller payout identity', () => {
  it('sellerPayout equals subtotal minus fees for a standard order', () => {
    const result = calculateFee({ config: defaultConfig, subtotalCents: 10_000, sellerOverride: null, promotion: null });
    expect(result.sellerPayoutCents).toBe(result.subtotalCents - result.commissionCents - result.processorFeeCents);
    expect(result.sellerPayoutCents).toBe(8_750);
  });

  it('sellerPayout is unaffected by shipping (shipping is a buyer-only add-on)', () => {
    const result = calculateFee({ config: fixedShippingConfig, subtotalCents: 10_000, sellerOverride: null, promotion: null });
    expect(result.sellerPayoutCents).toBe(result.subtotalCents - result.commissionCents - result.processorFeeCents);
    // same as without shipping
    expect(result.sellerPayoutCents).toBe(8_750);
  });

  it('identity holds under seller override commission rate', () => {
    const result = calculateFee({ config: defaultConfig, subtotalCents: 10_000, sellerOverride: { commissionBps: 500 }, promotion: null });
    expect(result.sellerPayoutCents).toBe(result.subtotalCents - result.commissionCents - result.processorFeeCents);
    expect(result.sellerPayoutCents).toBe(9_250); // 10000 - 500 - 250
  });

  it('identity holds with a full commission waiver', () => {
    const result = calculateFee({ config: defaultConfig, subtotalCents: 10_000, sellerOverride: { commissionBps: 0 }, promotion: null });
    expect(result.sellerPayoutCents).toBe(result.subtotalCents - result.commissionCents - result.processorFeeCents);
    expect(result.sellerPayoutCents).toBe(9_750); // only processor fee deducted
  });

  it('identity holds for non-round amounts', () => {
    const result = calculateFee({ config: defaultConfig, subtotalCents: 3333, sellerOverride: null, promotion: null });
    expect(result.sellerPayoutCents).toBe(result.subtotalCents - result.commissionCents - result.processorFeeCents);
  });
});

// ─── Platform revenue identity ────────────────────────────────────────────────
// commissionCents + processorFeeCents = subtotalCents - sellerPayoutCents

describe('order amount integrity – platform revenue identity', () => {
  it('platform take equals subtotal minus seller payout', () => {
    const result = calculateFee({ config: defaultConfig, subtotalCents: 10_000, sellerOverride: null, promotion: null });
    const platformTake = result.commissionCents + result.processorFeeCents;
    expect(platformTake).toBe(result.subtotalCents - result.sellerPayoutCents);
    expect(platformTake).toBe(1_250); // 1000 + 250
  });

  it('platform take is zero when both commission and processor fee are zero', () => {
    const freeConfig: FeeConfigSnapshot = { ...defaultConfig, commissionBps: 0, processorFeeBps: 0 };
    const result = calculateFee({ config: freeConfig, subtotalCents: 10_000, sellerOverride: null, promotion: null });
    expect(result.commissionCents + result.processorFeeCents).toBe(0);
    expect(result.sellerPayoutCents).toBe(result.subtotalCents);
  });
});

// ─── resolveChargeAmount – buyer charge invariant ─────────────────────────────
// The PSP charge must use buyerTotalCents when available, totalCents otherwise.

describe('resolveChargeAmount – buyer charge invariant', () => {
  it('returns buyerTotalCents for an order with a fee snapshot', () => {
    const order = { totalCents: 10_000, buyerTotalCents: 11_500 };
    expect(resolveChargeAmount(order)).toBe(11_500);
  });

  it('returns totalCents for a legacy order without a fee snapshot', () => {
    const order = { totalCents: 10_000, buyerTotalCents: null };
    expect(resolveChargeAmount(order)).toBe(10_000);
  });

  it('returns buyerTotalCents even when it equals totalCents (no shipping)', () => {
    const order = { totalCents: 10_000, buyerTotalCents: 10_000 };
    expect(resolveChargeAmount(order)).toBe(10_000);
  });

  it('charge amount differs from totalCents when shipping is applied', () => {
    const order = { totalCents: 10_000, buyerTotalCents: 11_500 };
    expect(resolveChargeAmount(order)).not.toBe(order.totalCents);
    expect(resolveChargeAmount(order)).toBe(order.buyerTotalCents);
  });
});

// ─── Cross-field consistency ──────────────────────────────────────────────────
// Ensure all three identities hold simultaneously on a single fee breakdown.

describe('order amount integrity – cross-field consistency', () => {
  it('all three identities hold simultaneously for a standard order', () => {
    const result = calculateFee({ config: defaultConfig, subtotalCents: 10_000, sellerOverride: null, promotion: null });

    // Buyer total identity
    expect(result.totalBuyerCents).toBe(result.subtotalCents + result.shippingCents);
    // Seller payout identity
    expect(result.sellerPayoutCents).toBe(result.subtotalCents - result.commissionCents - result.processorFeeCents);
    // Platform revenue identity
    expect(result.commissionCents + result.processorFeeCents).toBe(result.subtotalCents - result.sellerPayoutCents);
  });

  it('all three identities hold with fixed shipping', () => {
    const result = calculateFee({ config: fixedShippingConfig, subtotalCents: 8_500, sellerOverride: null, promotion: null });

    expect(result.totalBuyerCents).toBe(result.subtotalCents + result.shippingCents);
    expect(result.sellerPayoutCents).toBe(result.subtotalCents - result.commissionCents - result.processorFeeCents);
    expect(result.commissionCents + result.processorFeeCents).toBe(result.subtotalCents - result.sellerPayoutCents);
  });

  it('all three identities hold with a seller override and promotion', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 15_000,
      sellerOverride: { commissionBps: 600 },
      promotion: { code: 'DEAL20', discountBps: 200 },
    });

    // Effective commission = max(0, 600 - 200) = 400 bps; processor fee = 250 bps
    expect(result.commissionBps).toBe(400);
    expect(result.commissionCents).toBe(Math.round(15_000 * 400 / 10_000));
    expect(result.processorFeeCents).toBe(Math.round(15_000 * 250 / 10_000));

    // Promotion does NOT affect the buyer total or shipping
    expect(result.totalBuyerCents).toBe(result.subtotalCents + result.shippingCents);
    // Seller payout reflects the reduced commission from the promotion
    expect(result.sellerPayoutCents).toBe(result.subtotalCents - result.commissionCents - result.processorFeeCents);
    // Platform revenue identity holds with the discounted commission
    expect(result.commissionCents + result.processorFeeCents).toBe(result.subtotalCents - result.sellerPayoutCents);
  });

  it('charge amount from resolveChargeAmount equals buyerTotalCents from fee snapshot', () => {
    const result = calculateFee({ config: fixedShippingConfig, subtotalCents: 10_000, sellerOverride: null, promotion: null });

    // Simulate what gets stored on the order at creation time
    const orderWithSnapshot = {
      totalCents: result.subtotalCents,
      buyerTotalCents: result.totalBuyerCents,
    };

    expect(resolveChargeAmount(orderWithSnapshot)).toBe(result.totalBuyerCents);
  });
});
