import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { createPixAdapter } from '@arremate/payments';
import { logger } from '@arremate/observability';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapPspStatusToDb(pspStatus: 'PAID' | 'EXPIRED' | 'REFUNDED'): {
  dbPaymentStatus: 'PAID' | 'FAILED' | 'REFUNDED';
  dbOrderStatus: 'PAID' | 'CANCELLED';
} {
  const dbPaymentStatus = pspStatus === 'PAID'
    ? 'PAID'
    : pspStatus === 'REFUNDED'
      ? 'REFUNDED'
      : 'FAILED';
  const dbOrderStatus = pspStatus === 'PAID' ? 'PAID' : 'CANCELLED';
  return { dbPaymentStatus, dbOrderStatus };
}

// ─── Payment Reconciliation ───────────────────────────────────────────────────

/**
 * POST /v1/admin/payments/reconcile
 *
 * Queries the PSP for the current status of all PENDING payments whose
 * charge was created more than `olderThanMinutes` minutes ago (default: 30).
 * Any payment whose PSP status has diverged from the local record is
 * brought back in sync atomically.
 *
 * Body (optional JSON):
 *   { "olderThanMinutes": number }
 */
app.post('/v1/admin/payments/reconcile', ...adminGuard, async (c) => {
  let olderThanMinutes = 30;
  try {
    const body = await c.req.json<{ olderThanMinutes?: number }>();
    if (typeof body?.olderThanMinutes === 'number' && body.olderThanMinutes > 0) {
      olderThanMinutes = body.olderThanMinutes;
    }
  } catch {
    // body is optional; default is fine
  }

  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  const pendingPayments = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      providerId: { not: null },
      createdAt: { lte: cutoff },
    },
    include: { order: true },
  });

  if (pendingPayments.length === 0) {
    return c.json({ reconciled: 0, results: [] });
  }

  const pixAdapter = createPixAdapter();
  const results: Array<{
    paymentId: string;
    orderId: string;
    providerId: string;
    oldStatus: string;
    newStatus: string;
    error?: string;
  }> = [];

  for (const payment of pendingPayments) {
    const providerId = payment.providerId!;
    try {
      const pspStatus = await pixAdapter.getChargeStatus(providerId);

      if (pspStatus === 'PENDING') {
        results.push({
          paymentId: payment.id,
          orderId: payment.orderId,
          providerId,
          oldStatus: 'PENDING',
          newStatus: 'PENDING',
        });
        continue;
      }

      const { dbPaymentStatus, dbOrderStatus } = mapPspStatusToDb(pspStatus);

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: dbPaymentStatus },
        });
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: dbOrderStatus },
        });
      });

      logger.info('payment reconciled', {
        event: 'payment.reconciled',
        paymentId: payment.id,
        orderId: payment.orderId,
        providerId,
        oldStatus: 'PENDING',
        newStatus: dbPaymentStatus,
      });

      results.push({
        paymentId: payment.id,
        orderId: payment.orderId,
        providerId,
        oldStatus: 'PENDING',
        newStatus: dbPaymentStatus,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('payment reconciliation failed', {
        event: 'payment.reconciliation.error',
        paymentId: payment.id,
        providerId,
        error: message,
      });
      results.push({
        paymentId: payment.id,
        orderId: payment.orderId,
        providerId,
        oldStatus: 'PENDING',
        newStatus: 'PENDING',
        error: message,
      });
    }
  }

  const reconciledCount = results.filter((r) => r.newStatus !== 'PENDING').length;
  return c.json({ reconciled: reconciledCount, results });
});

/**
 * POST /v1/admin/payments/:paymentId/reconcile
 *
 * Queries the PSP for the current status of a single payment and updates
 * the local record if it has diverged.
 */
app.post('/v1/admin/payments/:paymentId/reconcile', ...adminGuard, async (c) => {
  const paymentId = c.req.param('paymentId');

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: true },
  });

  if (!payment) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Payment not found' }, 404);
  }

  if (!payment.providerId) {
    return c.json(
      { statusCode: 422, error: 'Unprocessable Entity', message: 'Payment has no provider ID to reconcile' },
      422,
    );
  }

  const pixAdapter = createPixAdapter();
  const pspStatus = await pixAdapter.getChargeStatus(payment.providerId);

  if (pspStatus === 'PENDING') {
    return c.json({
      paymentId: payment.id,
      orderId: payment.orderId,
      providerId: payment.providerId,
      oldStatus: payment.status,
      newStatus: payment.status,
      changed: false,
    });
  }

  // Short-circuit if the local record already reflects the PSP state.
  const { dbPaymentStatus, dbOrderStatus } = mapPspStatusToDb(pspStatus);
  if (payment.status === dbPaymentStatus) {
    return c.json({
      paymentId: payment.id,
      orderId: payment.orderId,
      providerId: payment.providerId,
      oldStatus: payment.status,
      newStatus: payment.status,
      changed: false,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: dbPaymentStatus },
    });
    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: dbOrderStatus },
    });
  });

  logger.info('payment reconciled', {
    event: 'payment.reconciled',
    paymentId: payment.id,
    orderId: payment.orderId,
    providerId: payment.providerId,
    oldStatus: payment.status,
    newStatus: dbPaymentStatus,
  });

  return c.json({
    paymentId: payment.id,
    orderId: payment.orderId,
    providerId: payment.providerId,
    oldStatus: payment.status,
    newStatus: dbPaymentStatus,
    changed: true,
  });
});

export { app as adminReconciliationRoutes };
