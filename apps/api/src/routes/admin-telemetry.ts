import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import {
  computeBidSuccessRateSignal,
  computeRequestHealthSignal,
  computeLatencyStatusSignal,
  computePaymentFailureRateSignal,
  computeSuspiciousActivitySignal,
  computeAuthFailuresSignal,
  computeWebhookFailuresSignal,
  computeRequestSurgeSignal,
  computeDbUsageSignal,
  buildQualitySignals,
  buildSecuritySignals,
  buildBudgetSignals,
  computeOverallStatus,
} from '../services/review-summary.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

// ─── GET /v1/admin/telemetry/review-summary ───────────────────────────────────
//
// Machine-readable summary of quality, security, and budget signals for
// automated review agents.
//
// Query params:
//   windowHours — look-back window in hours (default: 24, max: 168)

app.get('/v1/admin/telemetry/review-summary', ...adminGuard, async (c) => {
  const rawWindow = Number(c.req.query('windowHours') ?? '24');
  const windowHours = Number.isFinite(rawWindow) && rawWindow > 0
    ? Math.min(rawWindow, 168)
    : 24;

  const now = new Date();
  const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // ── Quality: bid success rate ────────────────────────────────────────────────
  const [totalBids, confirmedClaims] = await Promise.all([
    prisma.liveBid.count({ where: { createdAt: { gte: windowStart } } }),
    prisma.claim.count({ where: { status: 'CONFIRMED', createdAt: { gte: windowStart } } }),
  ]);

  // ── Quality: request health (paid vs total orders) ───────────────────────────
  const [paidOrders, totalOrders] = await Promise.all([
    prisma.order.count({ where: { status: 'PAID', createdAt: { gte: windowStart } } }),
    prisma.order.count({ where: { createdAt: { gte: windowStart } } }),
  ]);

  // ── Quality: latency — avg time from payment creation to order marked PAID ───
  // Uses a raw query for efficient aggregate computation.
  const latencyResult = await prisma.$queryRaw<Array<{ avg_ms: number | null }>>`
    SELECT AVG(EXTRACT(EPOCH FROM (o.updated_at - p.created_at)) * 1000)::float AS avg_ms
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE o.status = 'PAID'
      AND o.updated_at >= ${windowStart}
      AND p.status = 'PAID'
  `;
  const avgResolutionMs = latencyResult[0]?.avg_ms ?? null;

  // ── Quality: payment failure rate ────────────────────────────────────────────
  const [failedPayments, totalPayments] = await Promise.all([
    prisma.payment.count({ where: { status: 'FAILED', createdAt: { gte: windowStart } } }),
    prisma.payment.count({ where: { createdAt: { gte: windowStart } } }),
  ]);

  // ── Security: suspicious activity — open disputes + recent moderation cases ──
  const [openDisputes, moderationCases] = await Promise.all([
    prisma.dispute.count({
      where: { status: { in: ['OPEN', 'UNDER_REVIEW'] }, createdAt: { gte: windowStart } },
    }),
    prisma.moderationCase.count({ where: { createdAt: { gte: windowStart } } }),
  ]);
  const suspiciousCount = openDisputes + moderationCases;

  // ── Security: auth failures — recently suspended users (proxy) ────────────────
  const authFailureCount = await prisma.user.count({
    where: {
      isSuspended: true,
      suspendedAt: { gte: windowStart },
    },
  });

  // ── Security: webhook failures — PixWebhookLog entries with unexpected status ─
  // We consider any status that is not 'PAID' or 'PENDING' as a failure indicator.
  const knownOkStatuses = ['PAID', 'PENDING'];
  const webhookFailureCount = await prisma.pixWebhookLog.count({
    where: {
      processedAt: { gte: windowStart },
      eventStatus: { notIn: knownOkStatuses },
    },
  });

  // ── Budget: request surge — orders in last 1 h vs window baseline ─────────────
  const recentOrderCount = await prisma.order.count({
    where: { createdAt: { gte: oneHourAgo } },
  });
  const baselinePerHour = windowHours > 0 ? totalOrders / windowHours : 0;

  // ── Budget: DB usage — total new records in the window ───────────────────────
  const [liveBidCount, paymentCount] = await Promise.all([
    prisma.liveBid.count({ where: { createdAt: { gte: windowStart } } }),
    prisma.payment.count({ where: { createdAt: { gte: windowStart } } }),
  ]);
  const dbUsageCount = totalOrders + liveBidCount + paymentCount;

  // ── Assemble signals ─────────────────────────────────────────────────────────
  const quality = buildQualitySignals(
    computeBidSuccessRateSignal(totalBids, confirmedClaims),
    computeRequestHealthSignal(paidOrders, totalOrders),
    computeLatencyStatusSignal(avgResolutionMs),
    computePaymentFailureRateSignal(failedPayments, totalPayments),
  );

  const security = buildSecuritySignals(
    computeSuspiciousActivitySignal(suspiciousCount),
    computeAuthFailuresSignal(authFailureCount),
    computeWebhookFailuresSignal(webhookFailureCount),
  );

  const budget = buildBudgetSignals(
    computeRequestSurgeSignal(recentOrderCount, baselinePerHour),
    computeDbUsageSignal(dbUsageCount),
  );

  const overallStatus = computeOverallStatus([quality.status, security.status, budget.status]);

  return c.json({
    generatedAt: now.toISOString(),
    windowHours,
    status: overallStatus,
    quality,
    security,
    budget,
  });
});

export { app as adminTelemetryRoutes };
