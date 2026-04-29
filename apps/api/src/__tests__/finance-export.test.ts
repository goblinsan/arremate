import { describe, it, expect } from 'vitest';
import {
  formatPaymentExportRows,
  formatRefundExportRows,
  formatPayableExportRows,
  formatPayoutExportRows,
  formatRetainedFeeExportRows,
  formatFiscalDocumentExportRows,
  buildReconciliationSummary,
  type ReconciliationInput,
} from '../services/finance-export.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ts = '2024-03-01T00:00:00.000Z';
const periodStart = new Date('2024-03-01T00:00:00.000Z');
const periodEnd = new Date('2024-03-31T23:59:59.000Z');

// ─── formatPaymentExportRows ──────────────────────────────────────────────────

describe('formatPaymentExportRows', () => {
  it('converts cents to BRL string', () => {
    const rows = formatPaymentExportRows([
      {
        id: 'p1',
        orderId: 'o1',
        status: 'PAID',
        provider: 'pix',
        amountCents: 10_050,
        providerId: 'pix-abc',
        createdAt: ts,
        order: {
          status: 'PAID',
          seller: { id: 's1', name: 'Seller One', email: 'seller@example.com' },
          buyer: { id: 'b1', name: 'Buyer One', email: 'buyer@example.com' },
        },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].amountBrl).toBe('100.50');
    expect(rows[0].sellerEmail).toBe('seller@example.com');
    expect(rows[0].buyerEmail).toBe('buyer@example.com');
    expect(rows[0].status).toBe('PAID');
  });

  it('handles missing order gracefully', () => {
    const rows = formatPaymentExportRows([
      { id: 'p2', orderId: 'o2', status: 'PENDING', provider: 'pix', amountCents: 500, providerId: null, createdAt: ts },
    ]);
    expect(rows[0].sellerEmail).toBe('');
    expect(rows[0].buyerEmail).toBe('');
  });
});

// ─── formatRefundExportRows ───────────────────────────────────────────────────

describe('formatRefundExportRows', () => {
  it('serialises all money fields as BRL strings', () => {
    const rows = formatRefundExportRows([
      {
        id: 'r1',
        orderId: 'o1',
        refundType: 'FULL',
        refundAmountCents: 10_000,
        commissionReversalCents: 1_000,
        processorFeeReversalCents: 250,
        sellerClawbackCents: 8_750,
        payoutOffsetCents: 8_750,
        reason: 'Item not received',
        createdAt: ts,
        order: {
          status: 'REFUNDED',
          seller: { id: 's1', name: null, email: 'seller@example.com' },
        },
      },
    ]);

    expect(rows[0].refundAmountBrl).toBe('100.00');
    expect(rows[0].commissionReversalBrl).toBe('10.00');
    expect(rows[0].sellerClawbackBrl).toBe('87.50');
    expect(rows[0].sellerEmail).toBe('seller@example.com');
    expect(rows[0].sellerName).toBe('');
  });
});

// ─── formatPayableExportRows ──────────────────────────────────────────────────

describe('formatPayableExportRows', () => {
  it('includes fee columns when present', () => {
    const rows = formatPayableExportRows([
      {
        id: 'pay1',
        orderId: 'o1',
        sellerId: 's1',
        amountCents: 8_750,
        status: 'PENDING',
        createdAt: ts,
        seller: { id: 's1', name: 'Seller One', email: 'seller@example.com' },
        order: { status: 'PAID', commissionCents: 1_000, processorFeeCents: 250 },
      },
    ]);

    expect(rows[0].amountBrl).toBe('87.50');
    expect(rows[0].commissionBrl).toBe('10.00');
    expect(rows[0].processorFeeBrl).toBe('2.50');
  });

  it('leaves fee columns blank when order snapshot is missing', () => {
    const rows = formatPayableExportRows([
      {
        id: 'pay2',
        orderId: 'o2',
        sellerId: 's1',
        amountCents: 5_000,
        status: 'PAID',
        createdAt: ts,
        seller: null,
        order: null,
      },
    ]);

    expect(rows[0].commissionBrl).toBe('');
    expect(rows[0].processorFeeBrl).toBe('');
    expect(rows[0].sellerEmail).toBe('');
  });
});

// ─── formatPayoutExportRows ───────────────────────────────────────────────────

describe('formatPayoutExportRows', () => {
  it('formats payout batch rows correctly', () => {
    const rows = formatPayoutExportRows([
      {
        id: 'batch1',
        status: 'PAID',
        periodStart: '2024-03-01T00:00:00Z',
        periodEnd: '2024-03-31T23:59:59Z',
        totalCents: 100_000,
        entryCount: 5,
        notes: 'March close',
        paidAt: '2024-04-01T10:00:00Z',
        createdAt: ts,
      },
    ]);

    expect(rows[0].totalBrl).toBe('1000.00');
    expect(rows[0].entryCount).toBe('5');
    expect(rows[0].notes).toBe('March close');
  });
});

// ─── formatRetainedFeeExportRows ──────────────────────────────────────────────

describe('formatRetainedFeeExportRows', () => {
  it('computes net retained correctly', () => {
    const rows = formatRetainedFeeExportRows([
      {
        orderId: 'o1',
        orderStatus: 'PAID',
        sellerName: 'Seller X',
        subtotalCents: 10_000,
        commissionBps: 1_000,
        commissionCents: 1_000,
        processorFeeBps: 200,
        processorFeeCents: 200,
        netRetainedCents: 800,
        createdAt: ts,
      },
    ]);

    expect(rows[0].netRetainedBrl).toBe('8.00');
    expect(rows[0].commissionBrl).toBe('10.00');
    expect(rows[0].processorFeeBrl).toBe('2.00');
  });
});

// ─── formatFiscalDocumentExportRows ───────────────────────────────────────────

describe('formatFiscalDocumentExportRows', () => {
  it('serialises fiscal document row fields', () => {
    const rows = formatFiscalDocumentExportRows([
      {
        id: 'fd1',
        orderId: 'o1',
        invoiceResponsibility: 'PLATFORM',
        documentType: 'NFS_E_SERVICE_FEE',
        status: 'ISSUED',
        externalId: 'NF-001',
        issuedAt: '2024-03-15T12:00:00Z',
        errorMessage: null,
        createdAt: ts,
        order: {
          status: 'PAID',
          totalCents: 10_000,
          seller: { id: 's1', name: 'Seller One', email: 'seller@example.com' },
        },
      },
    ]);

    expect(rows[0].externalId).toBe('NF-001');
    expect(rows[0].orderTotalBrl).toBe('100.00');
    expect(rows[0].status).toBe('ISSUED');
  });

  it('handles null orderId gracefully', () => {
    const rows = formatFiscalDocumentExportRows([
      {
        id: 'fd2',
        orderId: null,
        invoiceResponsibility: 'SELLER',
        documentType: 'NF_E_GOODS',
        status: 'PENDING',
        externalId: null,
        issuedAt: null,
        errorMessage: null,
        createdAt: ts,
      },
    ]);

    expect(rows[0].orderId).toBe('');
    expect(rows[0].issuedAt).toBe('');
    expect(rows[0].externalId).toBe('');
  });
});

// ─── buildReconciliationSummary ───────────────────────────────────────────────

const baseInput: ReconciliationInput = {
  periodStart,
  periodEnd,
  payments: [
    { status: 'PAID', amountCents: 10_000 },
    { status: 'PAID', amountCents: 5_000 },
    { status: 'PENDING', amountCents: 3_000 },
    { status: 'FAILED', amountCents: 2_000 },
    { status: 'REFUNDED', amountCents: 1_000 },
  ],
  orders: [
    { status: 'PAID', commissionCents: 1_500, processorFeeCents: 300 },
    { status: 'PAID', commissionCents: 750, processorFeeCents: 150 },
  ],
  refunds: [
    { commissionReversalCents: 100, processorFeeReversalCents: 25 },
  ],
  payables: [
    { status: 'PENDING', amountCents: 8_000 },
    { status: 'INCLUDED_IN_BATCH', amountCents: 4_000 },
    { status: 'PAID', amountCents: 3_500 },
    { status: 'OFFSET', amountCents: 500 },
  ],
  payoutBatches: [
    { status: 'PAID', totalCents: 12_000 },
    { status: 'PENDING', totalCents: 5_000 },
  ],
  fiscalDocuments: [
    { status: 'ISSUED' },
    { status: 'ISSUED' },
    { status: 'PENDING' },
    { status: 'ERROR' },
  ],
  paidOrdersWithoutPayableCount: 0,
  stalePendingPaymentCount: 0,
};

describe('buildReconciliationSummary', () => {
  it('computes PSP cash totals correctly', () => {
    const summary = buildReconciliationSummary(baseInput);

    expect(summary.pspCash.paymentCount).toBe(5);
    expect(summary.pspCash.collectedCents).toBe(15_000); // two PAID payments
    expect(summary.pspCash.pendingCents).toBe(3_000);
    expect(summary.pspCash.failedCents).toBe(2_000);
    expect(summary.pspCash.refundedCents).toBe(1_000);
  });

  it('computes platform revenue correctly', () => {
    const summary = buildReconciliationSummary(baseInput);

    expect(summary.platformRevenue.grossCommissionCents).toBe(2_250); // 1500 + 750
    expect(summary.platformRevenue.processorFeeTotalCents).toBe(450); // 300 + 150
    expect(summary.platformRevenue.netRevenueCents).toBe(1_800);
    expect(summary.platformRevenue.refundReversalCents).toBe(125); // 100 + 25
    expect(summary.platformRevenue.adjustedNetRevenueCents).toBe(1_675);
  });

  it('computes seller liabilities correctly', () => {
    const summary = buildReconciliationSummary(baseInput);

    expect(summary.sellerLiabilities.pendingPayableCount).toBe(1);
    expect(summary.sellerLiabilities.pendingPayableCents).toBe(8_000);
    expect(summary.sellerLiabilities.includedInBatchCents).toBe(4_000);
    expect(summary.sellerLiabilities.paidPayableCents).toBe(3_500);
    expect(summary.sellerLiabilities.offsetPayableCents).toBe(500);
  });

  it('computes payout totals correctly', () => {
    const summary = buildReconciliationSummary(baseInput);

    expect(summary.payouts.batchCount).toBe(2);
    expect(summary.payouts.disbursedCents).toBe(12_000);
    expect(summary.payouts.pendingBatchCents).toBe(5_000);
    expect(summary.payouts.failedBatchCents).toBe(0);
  });

  it('counts fiscal document statuses correctly', () => {
    const summary = buildReconciliationSummary(baseInput);

    expect(summary.fiscalDocuments.issuedCount).toBe(2);
    expect(summary.fiscalDocuments.pendingCount).toBe(1);
    expect(summary.fiscalDocuments.errorCount).toBe(1);
    expect(summary.fiscalDocuments.cancelledCount).toBe(0);
  });

  it('produces no exceptions for a clean period', () => {
    const cleanInput: ReconciliationInput = {
      ...baseInput,
      fiscalDocuments: [{ status: 'ISSUED' }, { status: 'ISSUED' }],
      paidOrdersWithoutPayableCount: 0,
      stalePendingPaymentCount: 0,
      payoutBatches: [{ status: 'PAID', totalCents: 12_000 }],
    };
    const summary = buildReconciliationSummary(cleanInput);
    expect(summary.exceptions).toHaveLength(0);
  });

  it('raises HIGH exception for stale pending payments', () => {
    const summary = buildReconciliationSummary({
      ...baseInput,
      stalePendingPaymentCount: 3,
    });

    const exc = summary.exceptions.find((e) => e.type === 'STALE_PENDING_PAYMENT');
    expect(exc).toBeDefined();
    expect(exc!.severity).toBe('HIGH');
    expect(exc!.count).toBe(3);
  });

  it('raises HIGH exception for PAID orders without payable', () => {
    const summary = buildReconciliationSummary({
      ...baseInput,
      paidOrdersWithoutPayableCount: 2,
    });

    const exc = summary.exceptions.find((e) => e.type === 'PAID_ORDER_WITHOUT_PAYABLE');
    expect(exc).toBeDefined();
    expect(exc!.severity).toBe('HIGH');
    expect(exc!.count).toBe(2);
  });

  it('raises MEDIUM exception for fiscal document errors', () => {
    const summary = buildReconciliationSummary(baseInput);

    const exc = summary.exceptions.find((e) => e.type === 'FISCAL_DOCUMENT_ERROR');
    expect(exc).toBeDefined();
    expect(exc!.severity).toBe('MEDIUM');
    expect(exc!.count).toBe(1);
  });

  it('raises LOW exception for pending fiscal documents', () => {
    const summary = buildReconciliationSummary(baseInput);

    const exc = summary.exceptions.find((e) => e.type === 'FISCAL_DOCUMENT_PENDING');
    expect(exc).toBeDefined();
    expect(exc!.severity).toBe('LOW');
  });

  it('raises HIGH exception for failed payout batches', () => {
    const summary = buildReconciliationSummary({
      ...baseInput,
      payoutBatches: [
        { status: 'PAID', totalCents: 10_000 },
        { status: 'FAILED', totalCents: 5_000 },
      ],
    });

    const exc = summary.exceptions.find((e) => e.type === 'FAILED_PAYOUT_BATCH');
    expect(exc).toBeDefined();
    expect(exc!.severity).toBe('HIGH');
    expect(summary.payouts.failedBatchCents).toBe(5_000);
  });

  it('returns ISO period strings', () => {
    const summary = buildReconciliationSummary(baseInput);
    expect(summary.periodStart).toBe(periodStart.toISOString());
    expect(summary.periodEnd).toBe(periodEnd.toISOString());
  });
});
