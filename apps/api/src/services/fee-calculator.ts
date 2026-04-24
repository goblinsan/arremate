import type { ShippingModel } from '@arremate/database';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface FeeConfigSnapshot {
  id: string;
  version: number;
  commissionBps: number;
  processorFeeBps: number;
  shippingModel: ShippingModel;
  shippingFixedCents: number;
}

export interface SellerOverrideSnapshot {
  commissionBps: number;
}

export interface PromotionSnapshot {
  code: string;
  discountBps: number;
}

export interface FeeBreakdown {
  configVersionId: string;
  configVersion: number;
  subtotalCents: number;
  commissionBps: number;
  commissionCents: number;
  processorFeeBps: number;
  processorFeeCents: number;
  shippingCents: number;
  totalBuyerCents: number;
  sellerPayoutCents: number;
  promotionCode: string | null;
  promotionDiscountBps: number;
  sellerOverrideApplied: boolean;
}

// ─── Pure calculation (no I/O — easy to unit-test) ───────────────────────────

export interface CalculateFeeParams {
  config: FeeConfigSnapshot;
  subtotalCents: number;
  sellerOverride: SellerOverrideSnapshot | null;
  promotion: PromotionSnapshot | null;
}

function bpsToAmount(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10_000);
}

export function calculateFee(params: CalculateFeeParams): FeeBreakdown {
  const { config, subtotalCents, sellerOverride, promotion } = params;

  // Precedence: seller override > config default
  const baseCommissionBps = sellerOverride !== null
    ? sellerOverride.commissionBps
    : config.commissionBps;

  // Promotion reduces commission (cannot go below 0)
  const promotionDiscountBps = promotion ? promotion.discountBps : 0;
  const commissionBps = Math.max(0, baseCommissionBps - promotionDiscountBps);

  const commissionCents = bpsToAmount(subtotalCents, commissionBps);
  const processorFeeCents = bpsToAmount(subtotalCents, config.processorFeeBps);
  const shippingCents = config.shippingModel === 'FIXED' ? config.shippingFixedCents : 0;

  // Buyer pays item price + any shipping add-on
  const totalBuyerCents = subtotalCents + shippingCents;
  // Seller receives item price minus platform commission and processor fee
  const sellerPayoutCents = subtotalCents - commissionCents - processorFeeCents;

  return {
    configVersionId: config.id,
    configVersion: config.version,
    subtotalCents,
    commissionBps,
    commissionCents,
    processorFeeBps: config.processorFeeBps,
    processorFeeCents,
    shippingCents,
    totalBuyerCents,
    sellerPayoutCents,
    promotionCode: promotion ? promotion.code : null,
    promotionDiscountBps,
    sellerOverrideApplied: sellerOverride !== null,
  };
}
