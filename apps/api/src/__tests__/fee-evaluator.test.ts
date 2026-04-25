import { describe, it, expect } from 'vitest';
import { calculateFee } from '../services/fee-calculator.js';
import type { FeeConfigSnapshot } from '../services/fee-calculator.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const defaultConfig: FeeConfigSnapshot = {
  id: 'cfg-v1',
  version: 1,
  commissionBps: 1000,    // 10%
  processorFeeBps: 250,   // 2.5%
  shippingModel: 'INCLUDED',
  shippingFixedCents: 0,
};

// ─── Default config ───────────────────────────────────────────────────────────

describe('calculateFee – default config', () => {
  it('calculates commission and processor fee on a round amount', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 10_000, // R$ 100.00
      sellerOverride: null,
      promotion: null,
    });

    expect(result.configVersionId).toBe('cfg-v1');
    expect(result.configVersion).toBe(1);
    expect(result.subtotalCents).toBe(10_000);
    expect(result.commissionBps).toBe(1000);
    expect(result.commissionCents).toBe(1000);
    expect(result.processorFeeBps).toBe(250);
    expect(result.processorFeeCents).toBe(250);
    expect(result.shippingCents).toBe(0);
    expect(result.totalBuyerCents).toBe(10_000);
    expect(result.sellerPayoutCents).toBe(8_750); // 10000 - 1000 - 250
    expect(result.promotionCode).toBeNull();
    expect(result.promotionDiscountBps).toBe(0);
    expect(result.sellerOverrideApplied).toBe(false);
  });

  it('rounds fractional basis-point calculations', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 3333, // non-round amount
      sellerOverride: null,
      promotion: null,
    });

    // 10% of 3333 = 333.3 → rounds to 333
    expect(result.commissionCents).toBe(333);
    // 2.5% of 3333 = 83.325 → rounds to 83
    expect(result.processorFeeCents).toBe(83);
    expect(result.sellerPayoutCents).toBe(3333 - 333 - 83);
  });

  it('produces zero fees when both bps values are 0', () => {
    const zeroFeeConfig: FeeConfigSnapshot = {
      ...defaultConfig,
      commissionBps: 0,
      processorFeeBps: 0,
    };
    const result = calculateFee({ config: zeroFeeConfig, subtotalCents: 5000, sellerOverride: null, promotion: null });
    expect(result.commissionCents).toBe(0);
    expect(result.processorFeeCents).toBe(0);
    expect(result.sellerPayoutCents).toBe(5000);
  });
});

// ─── Seller override ──────────────────────────────────────────────────────────

describe('calculateFee – seller override', () => {
  it('replaces the config commission rate with the seller-specific rate', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 10_000,
      sellerOverride: { commissionBps: 500 }, // reduced to 5%
      promotion: null,
    });

    expect(result.commissionBps).toBe(500);
    expect(result.commissionCents).toBe(500);
    expect(result.sellerOverrideApplied).toBe(true);
    expect(result.sellerPayoutCents).toBe(9_250); // 10000 - 500 - 250
  });

  it('allows a seller override of 0 (full waiver)', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 10_000,
      sellerOverride: { commissionBps: 0 },
      promotion: null,
    });

    expect(result.commissionBps).toBe(0);
    expect(result.commissionCents).toBe(0);
    expect(result.sellerOverrideApplied).toBe(true);
  });

  it('can apply a promotional discount on top of a seller override', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 10_000,
      sellerOverride: { commissionBps: 600 }, // 6% override
      promotion: { code: 'EXTRA', discountBps: 200 }, // additional 2% off
    });

    expect(result.commissionBps).toBe(400); // 6% - 2% = 4%
    expect(result.sellerOverrideApplied).toBe(true);
    expect(result.promotionCode).toBe('EXTRA');
  });
});

// ─── Promotional discount ─────────────────────────────────────────────────────

describe('calculateFee – promotional discount', () => {
  it('subtracts the promotion discount from the commission rate', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 10_000,
      sellerOverride: null,
      promotion: { code: 'LAUNCH50', discountBps: 500 }, // 5% off commission
    });

    expect(result.commissionBps).toBe(500); // 10% - 5%
    expect(result.commissionCents).toBe(500);
    expect(result.promotionCode).toBe('LAUNCH50');
    expect(result.promotionDiscountBps).toBe(500);
    expect(result.sellerOverrideApplied).toBe(false);
  });

  it('clamps commission to zero when discount exceeds rate', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 10_000,
      sellerOverride: null,
      promotion: { code: 'FREE', discountBps: 2000 }, // 20% discount > 10% rate
    });

    expect(result.commissionBps).toBe(0);
    expect(result.commissionCents).toBe(0);
    expect(result.promotionDiscountBps).toBe(2000);
  });

  it('processor fee is unaffected by promotion', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 10_000,
      sellerOverride: null,
      promotion: { code: 'NOFEE', discountBps: 1000 }, // eliminates commission entirely
    });

    expect(result.commissionCents).toBe(0);
    expect(result.processorFeeCents).toBe(250); // still applied
  });
});

// ─── Shipping models ──────────────────────────────────────────────────────────

describe('calculateFee – shipping models', () => {
  it('INCLUDED: no extra shipping charge added to buyer total', () => {
    const result = calculateFee({ config: defaultConfig, subtotalCents: 10_000, sellerOverride: null, promotion: null });
    expect(result.shippingCents).toBe(0);
    expect(result.totalBuyerCents).toBe(10_000);
  });

  it('FIXED: adds the configured fixed amount to buyer total', () => {
    const fixedShippingConfig: FeeConfigSnapshot = {
      ...defaultConfig,
      shippingModel: 'FIXED',
      shippingFixedCents: 1500, // R$ 15.00
    };
    const result = calculateFee({ config: fixedShippingConfig, subtotalCents: 10_000, sellerOverride: null, promotion: null });
    expect(result.shippingCents).toBe(1500);
    expect(result.totalBuyerCents).toBe(11_500);
    expect(result.sellerPayoutCents).toBe(8_750); // shipping does not affect seller payout
  });

  it('PASS_THROUGH: no pre-defined shipping charge (handled externally)', () => {
    const passThroughConfig: FeeConfigSnapshot = {
      ...defaultConfig,
      shippingModel: 'PASS_THROUGH',
    };
    const result = calculateFee({ config: passThroughConfig, subtotalCents: 10_000, sellerOverride: null, promotion: null });
    expect(result.shippingCents).toBe(0);
    expect(result.totalBuyerCents).toBe(10_000);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('calculateFee – determinism', () => {
  it('produces identical output for identical input', () => {
    const params = {
      config: defaultConfig,
      subtotalCents: 7777,
      sellerOverride: null,
      promotion: null,
    };

    const r1 = calculateFee(params);
    const r2 = calculateFee(params);

    expect(r1).toEqual(r2);
  });
});

// ─── feeLineItems (extensible fee type model) ───────────────────────────────

describe('calculateFee – feeLineItems', () => {
  it('always includes COMMISSION and PROCESSOR_FEE as the first two line items', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 10_000,
      sellerOverride: null,
      promotion: null,
    });

    expect(result.feeLineItems).toHaveLength(2);
    expect(result.feeLineItems[0]).toEqual({ type: 'COMMISSION', amountCents: 1000, description: null });
    expect(result.feeLineItems[1]).toEqual({ type: 'PROCESSOR_FEE', amountCents: 250, description: null });
  });

  it('appends extra fee line items supplied by the caller', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 10_000,
      sellerOverride: null,
      promotion: null,
      extraFees: [
        { type: 'LOGISTICS_MARGIN', amountCents: 300, description: 'Frete plataforma' },
      ],
    });

    expect(result.feeLineItems).toHaveLength(3);
    expect(result.feeLineItems[2]).toEqual({ type: 'LOGISTICS_MARGIN', amountCents: 300, description: 'Frete plataforma' });
  });

  it('reflects zero-bps fees correctly in feeLineItems', () => {
    const zeroFeeConfig: FeeConfigSnapshot = { ...defaultConfig, commissionBps: 0, processorFeeBps: 0 };
    const result = calculateFee({ config: zeroFeeConfig, subtotalCents: 5000, sellerOverride: null, promotion: null });

    expect(result.feeLineItems[0]).toEqual({ type: 'COMMISSION', amountCents: 0, description: null });
    expect(result.feeLineItems[1]).toEqual({ type: 'PROCESSOR_FEE', amountCents: 0, description: null });
  });

  it('reflects the post-override commission in the COMMISSION line item', () => {
    const result = calculateFee({
      config: defaultConfig,
      subtotalCents: 10_000,
      sellerOverride: { commissionBps: 500 },
      promotion: null,
    });

    expect(result.feeLineItems[0]).toEqual({ type: 'COMMISSION', amountCents: 500, description: null });
  });
});
