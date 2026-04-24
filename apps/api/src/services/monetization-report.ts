// ─── Monetization Report Engine ──────────────────────────────────────────────
// Pure functions for computing GMV, commission, net revenue, shipping subsidy,
// refund-adjusted economics, and incentive impact from order and refund data.
// No I/O — all inputs are plain data objects so the functions are easy to test.

// ─── Input types ─────────────────────────────────────────────────────────────

export interface OrderSlice {
  subtotalCents: number | null;
  commissionBps: number | null;
  commissionCents: number | null;
  processorFeeBps: number | null;
  processorFeeCents: number | null;
  shippingCents: number | null;
  buyerTotalCents: number | null;
  sellerPayoutCents: number | null;
  promotionCode: string | null;
  promotionDiscountBps: number | null;
  sellerOverrideApplied: boolean | null;
  totalCents: number;
  /** commissionBps that would have applied without any override, from the fee config */
  configCommissionBps: number | null;
}

export interface RefundSlice {
  refundAmountCents: number;
  commissionReversalCents: number;
  processorFeeReversalCents: number;
  sellerClawbackCents: number;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface MonetizationMetrics {
  orderCount: number;
  ordersWithSnapshotCount: number;

  /** Sum of subtotalCents for orders that have a fee snapshot. */
  gmvCents: number;
  /** Sum of buyerTotalCents (subtotal + any shipping add-on). */
  totalBuyerSpendCents: number;

  /** Gross commission earned across all orders with a snapshot. */
  grossCommissionCents: number;
  /** Processor fees paid across all orders with a snapshot. */
  processorFeeTotalCents: number;
  /** Shipping included in buyer price but subsidised by the platform (INCLUDED model). */
  shippingSubsidyCents: number;
  /** grossCommissionCents minus processorFeeTotalCents. */
  netRevenueCents: number;

  /** Total amount refunded to buyers. */
  refundAmountCents: number;
  /** Commission reversed due to refunds. */
  commissionReversedCents: number;
  /** Processor fees reversed due to refunds. */
  processorFeeReversedCents: number;

  /** grossCommissionCents minus commissionReversedCents. */
  adjustedCommissionCents: number;
  /** adjustedCommissionCents minus (processorFeeTotalCents - processorFeeReversedCents). */
  adjustedNetRevenueCents: number;

  /**
   * Effective take rate in basis points:
   *   adjustedCommissionCents / gmvCents * 10_000
   * Returns 0 when gmvCents is 0.
   */
  effectiveTakeRateBps: number;
}

export interface PromotionMetrics {
  code: string;
  usageCount: number;
  gmvCents: number;
  commissionWaivedCents: number;
}

export interface IncentiveMetrics {
  /** Orders that had a seller-specific commission rate applied. */
  overrideOrderCount: number;
  overrideGmvCents: number;
  /** Commission actually collected on override orders. */
  overrideActualCommissionCents: number;
  /**
   * Commission that would have been collected at the standard config rate.
   * Requires configCommissionBps to be populated on the order slice.
   */
  overrideStandardCommissionCents: number;
  /** overrideStandardCommissionCents minus overrideActualCommissionCents. */
  commissionWaivedByOverridesCents: number;

  /** Orders that had a promotion code applied. */
  promotionOrderCount: number;
  promotionGmvCents: number;
  /** Commission waived due to promotions (promotionDiscountBps * subtotalCents). */
  commissionWaivedByPromotionsCents: number;
  topPromotions: PromotionMetrics[];

  /** Total commission waived across overrides and promotions. */
  totalIncentiveWaivedCents: number;
}

// ─── Pure computation ─────────────────────────────────────────────────────────

export function computeMonetizationMetrics(
  orders: OrderSlice[],
  refunds: RefundSlice[],
): MonetizationMetrics {
  const ordersWithSnapshot = orders.filter((o) => o.sellerPayoutCents != null);

  const gmvCents = ordersWithSnapshot.reduce((s, o) => s + (o.subtotalCents ?? 0), 0);
  const totalBuyerSpendCents = ordersWithSnapshot.reduce(
    (s, o) => s + (o.buyerTotalCents ?? o.totalCents),
    0,
  );
  const grossCommissionCents = ordersWithSnapshot.reduce((s, o) => s + (o.commissionCents ?? 0), 0);
  const processorFeeTotalCents = ordersWithSnapshot.reduce(
    (s, o) => s + (o.processorFeeCents ?? 0),
    0,
  );
  // shippingCents on an order reflects the shipping line in the fee snapshot;
  // when the model is INCLUDED it will be 0 even though the platform absorbs
  // the actual shipping cost — those are treated externally. We surface whatever
  // the fee snapshot recorded.
  const shippingSubsidyCents = ordersWithSnapshot.reduce((s, o) => s + (o.shippingCents ?? 0), 0);
  const netRevenueCents = grossCommissionCents - processorFeeTotalCents;

  const refundAmountCents = refunds.reduce((s, r) => s + r.refundAmountCents, 0);
  const commissionReversedCents = refunds.reduce((s, r) => s + r.commissionReversalCents, 0);
  const processorFeeReversedCents = refunds.reduce((s, r) => s + r.processorFeeReversalCents, 0);

  const adjustedCommissionCents = grossCommissionCents - commissionReversedCents;
  const adjustedNetRevenueCents =
    adjustedCommissionCents - (processorFeeTotalCents - processorFeeReversedCents);

  const effectiveTakeRateBps =
    gmvCents > 0 ? Math.round((adjustedCommissionCents / gmvCents) * 10_000) : 0;

  return {
    orderCount: orders.length,
    ordersWithSnapshotCount: ordersWithSnapshot.length,
    gmvCents,
    totalBuyerSpendCents,
    grossCommissionCents,
    processorFeeTotalCents,
    shippingSubsidyCents,
    netRevenueCents,
    refundAmountCents,
    commissionReversedCents,
    processorFeeReversedCents,
    adjustedCommissionCents,
    adjustedNetRevenueCents,
    effectiveTakeRateBps,
  };
}

export function computeIncentiveMetrics(orders: OrderSlice[]): IncentiveMetrics {
  const overrideOrders = orders.filter(
    (o) => o.sellerOverrideApplied && o.sellerPayoutCents != null,
  );
  const promotionOrders = orders.filter(
    (o) => o.promotionCode != null && o.sellerPayoutCents != null,
  );

  const overrideGmvCents = overrideOrders.reduce((s, o) => s + (o.subtotalCents ?? 0), 0);
  const overrideActualCommissionCents = overrideOrders.reduce(
    (s, o) => s + (o.commissionCents ?? 0),
    0,
  );
  const overrideStandardCommissionCents = overrideOrders.reduce((s, o) => {
    if (o.configCommissionBps == null || o.subtotalCents == null) return s;
    return s + Math.round((o.subtotalCents * o.configCommissionBps) / 10_000);
  }, 0);
  const commissionWaivedByOverridesCents = Math.max(
    0,
    overrideStandardCommissionCents - overrideActualCommissionCents,
  );

  const promotionGmvCents = promotionOrders.reduce((s, o) => s + (o.subtotalCents ?? 0), 0);
  const commissionWaivedByPromotionsCents = promotionOrders.reduce((s, o) => {
    if (o.promotionDiscountBps == null || o.subtotalCents == null) return s;
    return s + Math.round((o.subtotalCents * o.promotionDiscountBps) / 10_000);
  }, 0);

  // Build per-code promotion map
  const promoMap = new Map<string, PromotionMetrics>();
  for (const o of promotionOrders) {
    if (!o.promotionCode) continue;
    const existing = promoMap.get(o.promotionCode) ?? {
      code: o.promotionCode,
      usageCount: 0,
      gmvCents: 0,
      commissionWaivedCents: 0,
    };
    const waived =
      o.promotionDiscountBps != null && o.subtotalCents != null
        ? Math.round((o.subtotalCents * o.promotionDiscountBps) / 10_000)
        : 0;
    promoMap.set(o.promotionCode, {
      ...existing,
      usageCount: existing.usageCount + 1,
      gmvCents: existing.gmvCents + (o.subtotalCents ?? 0),
      commissionWaivedCents: existing.commissionWaivedCents + waived,
    });
  }
  const topPromotions = [...promoMap.values()].sort(
    (a, b) => b.commissionWaivedCents - a.commissionWaivedCents,
  );

  return {
    overrideOrderCount: overrideOrders.length,
    overrideGmvCents,
    overrideActualCommissionCents,
    overrideStandardCommissionCents,
    commissionWaivedByOverridesCents,
    promotionOrderCount: promotionOrders.length,
    promotionGmvCents,
    commissionWaivedByPromotionsCents,
    topPromotions,
    totalIncentiveWaivedCents:
      commissionWaivedByOverridesCents + commissionWaivedByPromotionsCents,
  };
}
