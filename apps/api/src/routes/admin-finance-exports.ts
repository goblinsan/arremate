import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import {
  formatPaymentExportRows,
  formatRefundExportRows,
  formatPayableExportRows,
  formatPayoutExportRows,
  formatRetainedFeeExportRows,
  formatFiscalDocumentExportRows,
  buildReconciliationSummary,
} from '../services/finance-export.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

function defaultPeriod(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { from, to };
}

function requirePeriod(
  fromParam: string | undefined,
  toParam: string | undefined,
): { from: Date; to: Date } | null {
  const { from: defaultFrom, to: defaultTo } = defaultPeriod();
  return {
    from: parseDateParam(fromParam) ?? defaultFrom,
    to: parseDateParam(toParam) ?? defaultTo,
  };
}

// ─── GET /v1/admin/finance/export/payments ────────────────────────────────────
//
// Export all payments within the given period.
// Query params:
//   from    — ISO date (defaults to 30 days ago)
//   to      — ISO date (defaults to now)
//   status  — PENDING | PAID | FAILED | REFUNDED  (optional filter)

app.get('/v1/admin/finance/export/payments', ...adminGuard, async (c) => {
  const period = requirePeriod(c.req.query('from'), c.req.query('to'))!;
  const statusParam = c.req.query('status');

  const allowedStatuses = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
  type PS = (typeof allowedStatuses)[number];

  const where: Record<string, unknown> = {
    createdAt: { gte: period.from, lte: period.to },
  };
  if (statusParam && allowedStatuses.includes(statusParam as PS)) {
    where.status = statusParam as PS;
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: {
      order: {
        select: {
          status: true,
          seller: { select: { id: true, name: true, email: true } },
          buyer: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  return c.json({
    dataset: 'payments',
    periodStart: period.from.toISOString(),
    periodEnd: period.to.toISOString(),
    count: payments.length,
    rows: formatPaymentExportRows(payments),
  });
});

// ─── GET /v1/admin/finance/export/refunds ─────────────────────────────────────
//
// Export all refunds within the given period.
// Query params:
//   from — ISO date (defaults to 30 days ago)
//   to   — ISO date (defaults to now)

app.get('/v1/admin/finance/export/refunds', ...adminGuard, async (c) => {
  const period = requirePeriod(c.req.query('from'), c.req.query('to'))!;

  const refunds = await prisma.orderRefund.findMany({
    where: { createdAt: { gte: period.from, lte: period.to } },
    orderBy: { createdAt: 'asc' },
    include: {
      order: {
        select: {
          status: true,
          seller: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  return c.json({
    dataset: 'refunds',
    periodStart: period.from.toISOString(),
    periodEnd: period.to.toISOString(),
    count: refunds.length,
    rows: formatRefundExportRows(refunds),
  });
});

// ─── GET /v1/admin/finance/export/payables ────────────────────────────────────
//
// Export all seller payables within the given period.
// Query params:
//   from   — ISO date (defaults to 30 days ago)
//   to     — ISO date (defaults to now)
//   status — PENDING | INCLUDED_IN_BATCH | PAID | OFFSET  (optional filter)

app.get('/v1/admin/finance/export/payables', ...adminGuard, async (c) => {
  const period = requirePeriod(c.req.query('from'), c.req.query('to'))!;
  const statusParam = c.req.query('status');

  const allowedStatuses = ['PENDING', 'INCLUDED_IN_BATCH', 'PAID', 'OFFSET'] as const;
  type PS = (typeof allowedStatuses)[number];

  const where: Record<string, unknown> = {
    createdAt: { gte: period.from, lte: period.to },
  };
  if (statusParam && allowedStatuses.includes(statusParam as PS)) {
    where.status = statusParam as PS;
  }

  const payables = await prisma.sellerPayable.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: {
      seller: { select: { id: true, name: true, email: true } },
      order: { select: { status: true, commissionCents: true, processorFeeCents: true } },
    },
  });

  return c.json({
    dataset: 'payables',
    periodStart: period.from.toISOString(),
    periodEnd: period.to.toISOString(),
    count: payables.length,
    rows: formatPayableExportRows(payables),
  });
});

// ─── GET /v1/admin/finance/export/payouts ─────────────────────────────────────
//
// Export all payout batches within the given period.
// Query params:
//   from   — ISO date (defaults to 30 days ago)
//   to     — ISO date (defaults to now)
//   status — PENDING | PROCESSING | PAID | FAILED  (optional filter)

app.get('/v1/admin/finance/export/payouts', ...adminGuard, async (c) => {
  const period = requirePeriod(c.req.query('from'), c.req.query('to'))!;
  const statusParam = c.req.query('status');

  const allowedStatuses = ['PENDING', 'PROCESSING', 'PAID', 'FAILED'] as const;
  type PS = (typeof allowedStatuses)[number];

  const where: Record<string, unknown> = {
    createdAt: { gte: period.from, lte: period.to },
  };
  if (statusParam && allowedStatuses.includes(statusParam as PS)) {
    where.status = statusParam as PS;
  }

  const batches = await prisma.payoutBatch.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { entries: true } },
    },
  });

  const rows = batches.map((b) => ({
    ...b,
    entryCount: b._count.entries,
  }));

  return c.json({
    dataset: 'payouts',
    periodStart: period.from.toISOString(),
    periodEnd: period.to.toISOString(),
    count: batches.length,
    rows: formatPayoutExportRows(rows),
  });
});

// ─── GET /v1/admin/finance/export/retained-fees ───────────────────────────────
//
// Export platform-retained fee breakdown (commission + processor fee) per order
// in the given period.
// Query params:
//   from — ISO date (defaults to 30 days ago)
//   to   — ISO date (defaults to now)

app.get('/v1/admin/finance/export/retained-fees', ...adminGuard, async (c) => {
  const period = requirePeriod(c.req.query('from'), c.req.query('to'))!;

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: period.from, lte: period.to },
      status: { in: ['PAID', 'REFUNDED'] },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      status: true,
      subtotalCents: true,
      commissionBps: true,
      commissionCents: true,
      processorFeeBps: true,
      processorFeeCents: true,
      createdAt: true,
      seller: { select: { id: true, name: true, email: true } },
    },
  });

  const rows = orders.map((o) => ({
    orderId: o.id,
    orderStatus: o.status,
    sellerName: o.seller?.name ?? o.seller?.email ?? '',
    subtotalCents: o.subtotalCents,
    commissionBps: o.commissionBps,
    commissionCents: o.commissionCents,
    processorFeeBps: o.processorFeeBps,
    processorFeeCents: o.processorFeeCents,
    netRetainedCents: (o.commissionCents ?? 0) - (o.processorFeeCents ?? 0),
    createdAt: o.createdAt,
  }));

  return c.json({
    dataset: 'retained-fees',
    periodStart: period.from.toISOString(),
    periodEnd: period.to.toISOString(),
    count: orders.length,
    rows: formatRetainedFeeExportRows(rows),
  });
});

// ─── GET /v1/admin/finance/export/fiscal-documents ────────────────────────────
//
// Export fiscal documents within the given period.
// Query params:
//   from   — ISO date (defaults to 30 days ago)
//   to     — ISO date (defaults to now)
//   status — PENDING | ISSUED | CANCELLED | ERROR  (optional filter)

app.get('/v1/admin/finance/export/fiscal-documents', ...adminGuard, async (c) => {
  const period = requirePeriod(c.req.query('from'), c.req.query('to'))!;
  const statusParam = c.req.query('status');

  const allowedStatuses = ['PENDING', 'ISSUED', 'CANCELLED', 'ERROR'] as const;
  type FS = (typeof allowedStatuses)[number];

  const where: Record<string, unknown> = {
    createdAt: { gte: period.from, lte: period.to },
  };
  if (statusParam && allowedStatuses.includes(statusParam as FS)) {
    where.status = statusParam as FS;
  }

  const docs = await prisma.fiscalDocument.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: {
      order: {
        select: {
          status: true,
          totalCents: true,
          seller: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  return c.json({
    dataset: 'fiscal-documents',
    periodStart: period.from.toISOString(),
    periodEnd: period.to.toISOString(),
    count: docs.length,
    rows: formatFiscalDocumentExportRows(docs),
  });
});

// ─── GET /v1/admin/finance/reconciliation ────────────────────────────────────
//
// Aggregated reconciliation summary: PSP cash vs. platform revenue vs. seller
// liabilities, with an exception list surfacing items that need attention.
// Query params:
//   from — ISO date (defaults to 30 days ago)
//   to   — ISO date (defaults to now)

app.get('/v1/admin/finance/reconciliation', ...adminGuard, async (c) => {
  const period = requirePeriod(c.req.query('from'), c.req.query('to'))!;
  const cutoff30m = new Date(Date.now() - 30 * 60 * 1000);

  const [
    payments,
    orders,
    refunds,
    payables,
    payoutBatches,
    fiscalDocuments,
    stalePendingPaymentCount,
    paidOrdersWithoutPayableCount,
  ] = await Promise.all([
    prisma.payment.findMany({
      where: { createdAt: { gte: period.from, lte: period.to } },
      select: { status: true, amountCents: true },
    }),
    prisma.order.findMany({
      where: {
        createdAt: { gte: period.from, lte: period.to },
        status: { in: ['PAID', 'REFUNDED'] },
      },
      select: { status: true, commissionCents: true, processorFeeCents: true },
    }),
    prisma.orderRefund.findMany({
      where: { createdAt: { gte: period.from, lte: period.to } },
      select: { commissionReversalCents: true, processorFeeReversalCents: true },
    }),
    prisma.sellerPayable.findMany({
      where: { createdAt: { gte: period.from, lte: period.to } },
      select: { status: true, amountCents: true },
    }),
    prisma.payoutBatch.findMany({
      where: { createdAt: { gte: period.from, lte: period.to } },
      select: { status: true, totalCents: true },
    }),
    prisma.fiscalDocument.findMany({
      where: { createdAt: { gte: period.from, lte: period.to } },
      select: { status: true },
    }),
    // Stale pending payments: PENDING and older than 30 minutes, in the period
    prisma.payment.count({
      where: {
        status: 'PENDING',
        createdAt: { gte: period.from, lte: cutoff30m },
      },
    }),
    // PAID orders in period with no payable record
    prisma.order.count({
      where: {
        createdAt: { gte: period.from, lte: period.to },
        status: 'PAID',
        payable: null,
      },
    }),
  ]);

  const summary = buildReconciliationSummary({
    periodStart: period.from,
    periodEnd: period.to,
    payments,
    orders,
    refunds,
    payables,
    payoutBatches,
    fiscalDocuments,
    paidOrdersWithoutPayableCount,
    stalePendingPaymentCount,
  });

  return c.json(summary);
});

export { app as adminFinanceExportRoutes };
