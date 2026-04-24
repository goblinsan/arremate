import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import {
  computeMonetizationMetrics,
  computeIncentiveMetrics,
  type OrderSlice,
  type RefundSlice,
} from '../services/monetization-report.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

// ─── GET /v1/admin/analytics/monetization ────────────────────────────────────
//
// Aggregated monetization metrics for a given date window.
// Query params:
//   from  — ISO date string (inclusive, defaults to 30 days ago)
//   to    — ISO date string (inclusive, defaults to now)
//   status — comma-separated list of order statuses to include
//            (defaults to PAID,REFUNDED)

app.get('/v1/admin/analytics/monetization', ...adminGuard, async (c) => {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const from = parseDateParam(c.req.query('from')) ?? defaultFrom;
  const to = parseDateParam(c.req.query('to')) ?? now;

  const statusParam = c.req.query('status');
  const allowedStatuses = ['PAID', 'PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'] as const;
  type OrderStatus = (typeof allowedStatuses)[number];

  const statuses: OrderStatus[] = statusParam
    ? (statusParam
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is OrderStatus =>
          allowedStatuses.includes(s as OrderStatus),
        ))
    : ['PAID', 'REFUNDED'];

  const [orders, refunds] = await Promise.all([
    prisma.order.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        status: { in: statuses },
      },
      select: {
        id: true,
        status: true,
        totalCents: true,
        subtotalCents: true,
        commissionBps: true,
        commissionCents: true,
        processorFeeBps: true,
        processorFeeCents: true,
        shippingCents: true,
        buyerTotalCents: true,
        sellerPayoutCents: true,
        promotionCode: true,
        promotionDiscountBps: true,
        sellerOverrideApplied: true,
        feeConfigVersionId: true,
      },
    }),
    prisma.orderRefund.findMany({
      where: { order: { createdAt: { gte: from, lte: to }, status: { in: statuses } } },
      select: {
        refundAmountCents: true,
        commissionReversalCents: true,
        processorFeeReversalCents: true,
        sellerClawbackCents: true,
      },
    }),
  ]);

  const metrics = computeMonetizationMetrics(
    orders.map((o): OrderSlice => ({ ...o, configCommissionBps: null })),
    refunds as RefundSlice[],
  );

  return c.json({
    periodStart: from.toISOString(),
    periodEnd: to.toISOString(),
    statuses,
    ...metrics,
  });
});

// ─── GET /v1/admin/analytics/incentives ──────────────────────────────────────
//
// Fee-waiver and incentive impact analysis for a given date window.
// Query params:
//   from  — ISO date string (inclusive, defaults to 30 days ago)
//   to    — ISO date string (inclusive, defaults to now)

app.get('/v1/admin/analytics/incentives', ...adminGuard, async (c) => {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const from = parseDateParam(c.req.query('from')) ?? defaultFrom;
  const to = parseDateParam(c.req.query('to')) ?? now;

  // Fetch PAID orders with their fee config so we can compute the standard rate
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      status: { in: ['PAID', 'REFUNDED'] },
    },
    select: {
      id: true,
      totalCents: true,
      subtotalCents: true,
      commissionBps: true,
      commissionCents: true,
      processorFeeBps: true,
      processorFeeCents: true,
      shippingCents: true,
      buyerTotalCents: true,
      sellerPayoutCents: true,
      promotionCode: true,
      promotionDiscountBps: true,
      sellerOverrideApplied: true,
      feeConfigVersionId: true,
    },
  });

  // Load distinct fee configs referenced by these orders to resolve standard rates
  const configIds = [
    ...new Set(orders.map((o) => o.feeConfigVersionId).filter((id): id is string => id != null)),
  ];
  const feeConfigs = configIds.length
    ? await prisma.feeConfig.findMany({
        where: { id: { in: configIds } },
        select: { id: true, commissionBps: true },
      })
    : [];
  const configMap = new Map(feeConfigs.map((fc): [string, number] => [fc.id, fc.commissionBps]));

  const slices: OrderSlice[] = orders.map((o) => ({
    ...o,
    configCommissionBps: o.feeConfigVersionId ? (configMap.get(o.feeConfigVersionId) ?? null) : null,
  }));

  const metrics = computeIncentiveMetrics(slices);

  return c.json({
    periodStart: from.toISOString(),
    periodEnd: to.toISOString(),
    ...metrics,
  });
});

// ─── GET /v1/seller/fee-info ──────────────────────────────────────────────────
//
// Returns the currently-active fee configuration parameters so sellers can
// understand and simulate their take-home payout.  No sensitive admin data
// is exposed — only the commission and processor-fee rates.

app.get('/v1/seller/fee-info', authenticate, async (c) => {
  const now = new Date();
  const config = await prisma.feeConfig.findFirst({
    where: {
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: {
      id: true,
      version: true,
      label: true,
      commissionBps: true,
      processorFeeBps: true,
      shippingModel: true,
      shippingFixedCents: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });

  if (!config) {
    return c.json(
      { statusCode: 404, error: 'Not Found', message: 'No active fee configuration found' },
      404,
    );
  }

  return c.json(config);
});

export { app as adminAnalyticsRoutes };
