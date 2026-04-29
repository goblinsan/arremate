// ─── Finance Export Service ──────────────────────────────────────────────────
// Pure functions for computing period-scoped finance export datasets and
// reconciliation summaries.  No I/O — all inputs are plain data objects so
// the functions are easy to test and can be called from HTTP routes or CLIs.

// ─── Input types ─────────────────────────────────────────────────────────────

export interface PaymentRow {
  id: string;
  orderId: string;
  status: string;
  provider: string;
  amountCents: number;
  providerId: string | null;
  createdAt: Date | string;
  order?: {
    status: string;
    seller?: { id: string; name: string | null; email: string } | null;
    buyer?: { id: string; name: string | null; email: string } | null;
  } | null;
}

export interface RefundRow {
  id: string;
  orderId: string;
  refundType: string;
  refundAmountCents: number;
  commissionReversalCents: number;
  processorFeeReversalCents: number;
  sellerClawbackCents: number;
  payoutOffsetCents: number;
  reason: string | null;
  createdAt: Date | string;
  order?: {
    status: string;
    seller?: { id: string; name: string | null; email: string } | null;
  } | null;
}

export interface PayableRow {
  id: string;
  orderId: string;
  sellerId: string;
  amountCents: number;
  status: string;
  createdAt: Date | string;
  seller?: { id: string; name: string | null; email: string } | null;
  order?: { status: string; commissionCents: number | null; processorFeeCents: number | null } | null;
}

export interface PayoutRow {
  id: string;
  status: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  totalCents: number;
  notes: string | null;
  paidAt: Date | string | null;
  createdAt: Date | string;
  entryCount?: number;
}

export interface RetainedFeeRow {
  orderId: string;
  orderStatus: string;
  sellerName: string;
  subtotalCents: number | null;
  commissionBps: number | null;
  commissionCents: number | null;
  processorFeeBps: number | null;
  processorFeeCents: number | null;
  netRetainedCents: number;
  createdAt: Date | string;
}

export interface FiscalDocumentRow {
  id: string;
  orderId: string | null;
  invoiceResponsibility: string;
  documentType: string;
  status: string;
  externalId: string | null;
  issuedAt: Date | string | null;
  errorMessage: string | null;
  createdAt: Date | string;
  order?: {
    status: string;
    totalCents: number;
    seller?: { id: string; name: string | null; email: string } | null;
  } | null;
}

// ─── Reconciliation types ──────────────────────────────────────────────────

export interface ReconciliationException {
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  count: number;
  description: string;
}

export interface ReconciliationSummary {
  periodStart: string;
  periodEnd: string;

  /** PSP/payment-processor view: what was actually collected. */
  pspCash: {
    paymentCount: number;
    collectedCents: number;
    pendingCents: number;
    failedCents: number;
    refundedCents: number;
  };

  /** Platform revenue view: commissions and fees retained by the platform. */
  platformRevenue: {
    grossCommissionCents: number;
    processorFeeTotalCents: number;
    netRevenueCents: number;
    refundReversalCents: number;
    adjustedNetRevenueCents: number;
  };

  /** Seller liability view: what the platform owes sellers. */
  sellerLiabilities: {
    pendingPayableCount: number;
    pendingPayableCents: number;
    includedInBatchCents: number;
    paidPayableCents: number;
    offsetPayableCents: number;
  };

  /** Payout view: disbursements made or in-flight. */
  payouts: {
    batchCount: number;
    disbursedCents: number;
    pendingBatchCents: number;
    failedBatchCents: number;
  };

  /** Fiscal document health. */
  fiscalDocuments: {
    pendingCount: number;
    issuedCount: number;
    errorCount: number;
    cancelledCount: number;
  };

  /** Exceptions surfaced for finance review. */
  exceptions: ReconciliationException[];
}

// ─── Export formatters ────────────────────────────────────────────────────────

/** Build a per-payment export row, suitable for CSV serialisation. */
export function formatPaymentExportRows(payments: PaymentRow[]): Record<string, string>[] {
  return payments.map((p) => ({
    id: p.id,
    orderId: p.orderId,
    status: p.status,
    provider: p.provider,
    amountBrl: (p.amountCents / 100).toFixed(2),
    providerId: p.providerId ?? '',
    sellerEmail: p.order?.seller?.email ?? '',
    sellerName: p.order?.seller?.name ?? '',
    buyerEmail: p.order?.buyer?.email ?? '',
    orderStatus: p.order?.status ?? '',
    createdAt: new Date(p.createdAt).toISOString(),
  }));
}

/** Build a per-refund export row. */
export function formatRefundExportRows(refunds: RefundRow[]): Record<string, string>[] {
  return refunds.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    refundType: r.refundType,
    refundAmountBrl: (r.refundAmountCents / 100).toFixed(2),
    commissionReversalBrl: (r.commissionReversalCents / 100).toFixed(2),
    processorFeeReversalBrl: (r.processorFeeReversalCents / 100).toFixed(2),
    sellerClawbackBrl: (r.sellerClawbackCents / 100).toFixed(2),
    payoutOffsetBrl: (r.payoutOffsetCents / 100).toFixed(2),
    reason: r.reason ?? '',
    sellerEmail: r.order?.seller?.email ?? '',
    sellerName: r.order?.seller?.name ?? '',
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

/** Build a per-payable export row. */
export function formatPayableExportRows(payables: PayableRow[]): Record<string, string>[] {
  return payables.map((p) => ({
    id: p.id,
    orderId: p.orderId,
    sellerId: p.sellerId,
    sellerEmail: p.seller?.email ?? '',
    sellerName: p.seller?.name ?? '',
    amountBrl: (p.amountCents / 100).toFixed(2),
    status: p.status,
    commissionBrl: p.order?.commissionCents != null ? (p.order.commissionCents / 100).toFixed(2) : '',
    processorFeeBrl: p.order?.processorFeeCents != null ? (p.order.processorFeeCents / 100).toFixed(2) : '',
    createdAt: new Date(p.createdAt).toISOString(),
  }));
}

/** Build a per-payout-batch export row. */
export function formatPayoutExportRows(payouts: PayoutRow[]): Record<string, string>[] {
  return payouts.map((p) => ({
    id: p.id,
    status: p.status,
    periodStart: new Date(p.periodStart).toISOString(),
    periodEnd: new Date(p.periodEnd).toISOString(),
    totalBrl: (p.totalCents / 100).toFixed(2),
    entryCount: String(p.entryCount ?? ''),
    notes: p.notes ?? '',
    paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : '',
    createdAt: new Date(p.createdAt).toISOString(),
  }));
}

/** Build a per-order retained-fee export row. */
export function formatRetainedFeeExportRows(rows: RetainedFeeRow[]): Record<string, string>[] {
  return rows.map((r) => ({
    orderId: r.orderId,
    orderStatus: r.orderStatus,
    sellerName: r.sellerName,
    subtotalBrl: r.subtotalCents != null ? (r.subtotalCents / 100).toFixed(2) : '',
    commissionBps: r.commissionBps != null ? String(r.commissionBps) : '',
    commissionBrl: r.commissionCents != null ? (r.commissionCents / 100).toFixed(2) : '',
    processorFeeBps: r.processorFeeBps != null ? String(r.processorFeeBps) : '',
    processorFeeBrl: r.processorFeeCents != null ? (r.processorFeeCents / 100).toFixed(2) : '',
    netRetainedBrl: (r.netRetainedCents / 100).toFixed(2),
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

/** Build a per-fiscal-document export row. */
export function formatFiscalDocumentExportRows(
  docs: FiscalDocumentRow[],
): Record<string, string>[] {
  return docs.map((d) => ({
    id: d.id,
    orderId: d.orderId ?? '',
    invoiceResponsibility: d.invoiceResponsibility,
    documentType: d.documentType,
    status: d.status,
    externalId: d.externalId ?? '',
    issuedAt: d.issuedAt ? new Date(d.issuedAt).toISOString() : '',
    errorMessage: d.errorMessage ?? '',
    orderStatus: d.order?.status ?? '',
    orderTotalBrl: d.order?.totalCents != null ? (d.order.totalCents / 100).toFixed(2) : '',
    sellerEmail: d.order?.seller?.email ?? '',
    sellerName: d.order?.seller?.name ?? '',
    createdAt: new Date(d.createdAt).toISOString(),
  }));
}

// ─── Reconciliation builder ───────────────────────────────────────────────────

export interface ReconciliationInput {
  periodStart: Date;
  periodEnd: Date;
  payments: Array<{ status: string; amountCents: number }>;
  orders: Array<{
    status: string;
    commissionCents: number | null;
    processorFeeCents: number | null;
  }>;
  refunds: Array<{
    commissionReversalCents: number;
    processorFeeReversalCents: number;
  }>;
  payables: Array<{ status: string; amountCents: number }>;
  payoutBatches: Array<{ status: string; totalCents: number }>;
  fiscalDocuments: Array<{ status: string }>;
  /** PAID orders with no associated SellerPayable. */
  paidOrdersWithoutPayableCount: number;
  /** PENDING payments older than 30 minutes. */
  stalePendingPaymentCount: number;
}

export function buildReconciliationSummary(input: ReconciliationInput): ReconciliationSummary {
  // PSP cash
  const paidPayments = input.payments.filter((p) => p.status === 'PAID');
  const pendingPayments = input.payments.filter((p) => p.status === 'PENDING');
  const failedPayments = input.payments.filter((p) => p.status === 'FAILED');
  const refundedPayments = input.payments.filter((p) => p.status === 'REFUNDED');

  const collectedCents = paidPayments.reduce((s, p) => s + p.amountCents, 0);
  const pendingCents = pendingPayments.reduce((s, p) => s + p.amountCents, 0);
  const failedCents = failedPayments.reduce((s, p) => s + p.amountCents, 0);
  const refundedCents = refundedPayments.reduce((s, p) => s + p.amountCents, 0);

  // Platform revenue (only orders with fee snapshot)
  const ordersWithFees = input.orders.filter((o) => o.commissionCents != null);
  const grossCommissionCents = ordersWithFees.reduce((s, o) => s + (o.commissionCents ?? 0), 0);
  const processorFeeTotalCents = ordersWithFees.reduce((s, o) => s + (o.processorFeeCents ?? 0), 0);
  const netRevenueCents = grossCommissionCents - processorFeeTotalCents;

  const refundReversalCents = input.refunds.reduce(
    (s, r) => s + r.commissionReversalCents + r.processorFeeReversalCents,
    0,
  );
  const adjustedNetRevenueCents = netRevenueCents - refundReversalCents;

  // Seller liabilities
  const pendingPayables = input.payables.filter((p) => p.status === 'PENDING');
  const batchedPayables = input.payables.filter((p) => p.status === 'INCLUDED_IN_BATCH');
  const paidPayables = input.payables.filter((p) => p.status === 'PAID');
  const offsetPayables = input.payables.filter((p) => p.status === 'OFFSET');

  const pendingPayableCents = pendingPayables.reduce((s, p) => s + p.amountCents, 0);
  const includedInBatchCents = batchedPayables.reduce((s, p) => s + p.amountCents, 0);
  const paidPayableCents = paidPayables.reduce((s, p) => s + p.amountCents, 0);
  const offsetPayableCents = offsetPayables.reduce((s, p) => s + p.amountCents, 0);

  // Payouts
  const paidBatches = input.payoutBatches.filter((b) => b.status === 'PAID');
  const pendingBatches = input.payoutBatches.filter(
    (b) => b.status === 'PENDING' || b.status === 'PROCESSING',
  );
  const failedBatches = input.payoutBatches.filter((b) => b.status === 'FAILED');

  const disbursedCents = paidBatches.reduce((s, b) => s + b.totalCents, 0);
  const pendingBatchCents = pendingBatches.reduce((s, b) => s + b.totalCents, 0);
  const failedBatchCents = failedBatches.reduce((s, b) => s + b.totalCents, 0);

  // Fiscal documents
  const fiscalByStatus = (status: string) =>
    input.fiscalDocuments.filter((d) => d.status === status).length;

  // Build exceptions list
  const exceptions: ReconciliationException[] = [];

  if (input.stalePendingPaymentCount > 0) {
    exceptions.push({
      type: 'STALE_PENDING_PAYMENT',
      severity: 'HIGH',
      count: input.stalePendingPaymentCount,
      description: `${input.stalePendingPaymentCount} payment(s) have been PENDING for more than 30 minutes — may need manual PSP reconciliation.`,
    });
  }

  if (input.paidOrdersWithoutPayableCount > 0) {
    exceptions.push({
      type: 'PAID_ORDER_WITHOUT_PAYABLE',
      severity: 'HIGH',
      count: input.paidOrdersWithoutPayableCount,
      description: `${input.paidOrdersWithoutPayableCount} PAID order(s) have no matching SellerPayable record — seller payout may be missing.`,
    });
  }

  const fiscalErrorCount = fiscalByStatus('ERROR');
  if (fiscalErrorCount > 0) {
    exceptions.push({
      type: 'FISCAL_DOCUMENT_ERROR',
      severity: 'MEDIUM',
      count: fiscalErrorCount,
      description: `${fiscalErrorCount} fiscal document(s) are in ERROR status and require reissuance.`,
    });
  }

  const fiscalPendingCount = fiscalByStatus('PENDING');
  if (fiscalPendingCount > 0) {
    exceptions.push({
      type: 'FISCAL_DOCUMENT_PENDING',
      severity: 'LOW',
      count: fiscalPendingCount,
      description: `${fiscalPendingCount} fiscal document(s) are still PENDING issuance.`,
    });
  }

  if (failedBatches.length > 0) {
    exceptions.push({
      type: 'FAILED_PAYOUT_BATCH',
      severity: 'HIGH',
      count: failedBatches.length,
      description: `${failedBatches.length} payout batch(es) have FAILED and require attention.`,
    });
  }

  return {
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),

    pspCash: {
      paymentCount: input.payments.length,
      collectedCents,
      pendingCents,
      failedCents,
      refundedCents,
    },

    platformRevenue: {
      grossCommissionCents,
      processorFeeTotalCents,
      netRevenueCents,
      refundReversalCents,
      adjustedNetRevenueCents,
    },

    sellerLiabilities: {
      pendingPayableCount: pendingPayables.length,
      pendingPayableCents,
      includedInBatchCents,
      paidPayableCents,
      offsetPayableCents,
    },

    payouts: {
      batchCount: input.payoutBatches.length,
      disbursedCents,
      pendingBatchCents,
      failedBatchCents,
    },

    fiscalDocuments: {
      pendingCount: fiscalPendingCount,
      issuedCount: fiscalByStatus('ISSUED'),
      errorCount: fiscalErrorCount,
      cancelledCount: fiscalByStatus('CANCELLED'),
    },

    exceptions,
  };
}
