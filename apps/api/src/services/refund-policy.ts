// ─── Refund Policy Engine ─────────────────────────────────────────────────────
// Calculates commission reversals, seller clawbacks, and payout offsets for
// full and partial refunds using the immutable fee snapshot stored on an order.
// No live fee config is consulted — all amounts derive from persisted data.

export type RefundType = 'FULL' | 'PARTIAL';

export interface OrderFeeSnapshot {
  totalCents: number;
  buyerTotalCents: number;
  commissionCents: number;
  processorFeeCents: number;
  sellerPayoutCents: number;
  shippingCents: number;
}

export interface RefundBreakdown {
  refundType: RefundType;
  /** Amount returned to the buyer in cents. */
  refundAmountCents: number;
  /** Platform commission reversed (no longer earned). */
  commissionReversalCents: number;
  /** Processor fee reversed. */
  processorFeeReversalCents: number;
  /** Amount the seller must return / be clawed back. */
  sellerClawbackCents: number;
  /** Amount to offset against the seller's next payout. */
  payoutOffsetCents: number;
}

export interface CalculateRefundParams {
  snapshot: OrderFeeSnapshot;
  /**
   * Amount to refund to the buyer in cents.
   * Omit (or pass undefined) for a full refund of the entire buyer total.
   * Must be between 1 and snapshot.buyerTotalCents (inclusive).
   */
  refundAmountCents?: number;
}

/**
 * Pure function — no I/O.  Computes the full refund breakdown from the
 * persisted fee snapshot so results are always reproducible.
 *
 * Accounting identity:
 *   refundAmountCents === commissionReversalCents
 *                       + processorFeeReversalCents
 *                       + sellerClawbackCents
 */
export function calculateRefund(params: CalculateRefundParams): RefundBreakdown {
  const { snapshot } = params;
  const buyerTotal = snapshot.buyerTotalCents > 0 ? snapshot.buyerTotalCents : snapshot.totalCents;
  const refundAmount = params.refundAmountCents ?? buyerTotal;

  if (refundAmount <= 0) {
    throw new Error('refundAmountCents must be greater than zero');
  }
  if (refundAmount > buyerTotal) {
    throw new Error(
      `refundAmountCents (${refundAmount}) cannot exceed buyerTotalCents (${buyerTotal})`,
    );
  }

  const isFullRefund = refundAmount === buyerTotal;
  const refundType: RefundType = isFullRefund ? 'FULL' : 'PARTIAL';

  if (isFullRefund) {
    return {
      refundType,
      refundAmountCents: refundAmount,
      commissionReversalCents: snapshot.commissionCents,
      processorFeeReversalCents: snapshot.processorFeeCents,
      sellerClawbackCents: snapshot.sellerPayoutCents,
      payoutOffsetCents: snapshot.sellerPayoutCents,
    };
  }

  // Partial refund — pro-rate commission and processor fee by the refund ratio,
  // then assign the remainder to the seller clawback so the accounting identity
  // holds regardless of rounding.
  const ratio = refundAmount / buyerTotal;
  const commissionReversal = Math.round(snapshot.commissionCents * ratio);
  const processorFeeReversal = Math.round(snapshot.processorFeeCents * ratio);
  const sellerClawback = refundAmount - commissionReversal - processorFeeReversal;

  return {
    refundType,
    refundAmountCents: refundAmount,
    commissionReversalCents: commissionReversal,
    processorFeeReversalCents: processorFeeReversal,
    sellerClawbackCents: sellerClawback,
    payoutOffsetCents: sellerClawback,
  };
}
