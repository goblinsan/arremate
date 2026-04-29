import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { createPixAdapter } from '@arremate/payments';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';
import { calculateRefund } from '../services/refund-policy.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

app.post('/v1/admin/orders/:orderId/refund', ...adminGuard, async (c) => {
  const orderId = c.req.param('orderId');
  const admin = c.get('currentUser');
  const body = await c.req.json<{ amountCents?: number; reason?: string }>().catch(() => ({} as { amountCents?: number; reason?: string }));

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payments: { orderBy: { createdAt: 'desc' } },
      payable: { select: { id: true, status: true } },
    },
  });
  if (!order) return c.json({ statusCode: 404, error: 'Not Found', message: 'Order not found' }, 404);
  if (order.status !== 'PAID') return c.json({ statusCode: 409, error: 'Conflict', message: `Cannot refund an order with status: ${order.status}` }, 409);
  const paidPayment = order.payments.find((p) => p.status === 'PAID');
  if (!paidPayment) return c.json({ statusCode: 409, error: 'Conflict', message: 'No paid payment found for this order' }, 409);

  const buyerTotal = order.buyerTotalCents ?? order.totalCents;

  if (body.amountCents !== undefined) {
    if (!Number.isInteger(body.amountCents) || body.amountCents <= 0) {
      return c.json({ statusCode: 400, error: 'Bad Request', message: 'amountCents must be a positive integer' }, 400);
    }
    if (body.amountCents > buyerTotal) {
      return c.json({ statusCode: 400, error: 'Bad Request', message: `amountCents (${body.amountCents}) exceeds the order buyer total (${buyerTotal})` }, 400);
    }
  }

  // Build fee snapshot from persisted order fields (falls back to zero when
  // order pre-dates fee snapshotting).
  const snapshot = {
    totalCents: order.totalCents,
    buyerTotalCents: buyerTotal,
    commissionCents: order.commissionCents ?? 0,
    processorFeeCents: order.processorFeeCents ?? 0,
    sellerPayoutCents: order.sellerPayoutCents ?? order.totalCents,
    shippingCents: order.shippingCents ?? 0,
  };

  const refundBreakdown = calculateRefund({ snapshot, refundAmountCents: body.amountCents });
  const isFullRefund = refundBreakdown.refundType === 'FULL';

  if (paidPayment.providerId) {
    const paymentAdapter = createPixAdapter();
    await paymentAdapter.refundCharge(paidPayment.providerId);
  }

  const { updatedPayment, updatedOrder, orderRefund } = await prisma.$transaction(async (tx) => {
    const nextPayment = await tx.payment.update({ where: { id: paidPayment.id }, data: { status: 'REFUNDED' } });
    const nextOrder = await tx.order.update({ where: { id: orderId }, data: { status: isFullRefund ? 'REFUNDED' : 'PAID' } });
    const createdRefund = await tx.orderRefund.create({
      data: {
        orderId,
        issuedById: admin.id,
        refundType: refundBreakdown.refundType,
        refundAmountCents: refundBreakdown.refundAmountCents,
        commissionReversalCents: refundBreakdown.commissionReversalCents,
        processorFeeReversalCents: refundBreakdown.processorFeeReversalCents,
        sellerClawbackCents: refundBreakdown.sellerClawbackCents,
        payoutOffsetCents: refundBreakdown.payoutOffsetCents,
        reason: body.reason ?? null,
      },
    });

    // Create a settlement offset entry so the clawback is absorbed in the next
    // payout batch.  The entry uses a negative amountCents to reduce the seller
    // net payout.
    if (refundBreakdown.payoutOffsetCents > 0) {
      await tx.settlementLedgerEntry.create({
        data: {
          sellerId: order.sellerId,
          feeType: 'REFUND_OFFSET',
          amountCents: -refundBreakdown.payoutOffsetCents,
          description: `Estorno de reembolso - pedido #${orderId.slice(-8).toUpperCase()}`,
          orderId,
          orderRefundId: createdRefund.id,
        },
      });
    }

    // When a full refund voids the payable, mark it OFFSET so it is excluded
    // from future payout batches.
    if (isFullRefund && order.payable && order.payable.status === 'PENDING') {
      await tx.sellerPayable.update({
        where: { id: order.payable.id },
        data: { status: 'OFFSET' },
      });
    }

    return { updatedPayment: nextPayment, updatedOrder: nextOrder, orderRefund: createdRefund };
  });

  await createAuditEvent({
    action: isFullRefund ? 'ORDER_REFUNDED' : 'ORDER_PARTIAL_REFUND',
    actorId: admin.id,
    metadata: {
      orderId,
      paymentId: paidPayment.id,
      refundType: refundBreakdown.refundType,
      refundAmountCents: refundBreakdown.refundAmountCents,
      commissionReversalCents: refundBreakdown.commissionReversalCents,
      processorFeeReversalCents: refundBreakdown.processorFeeReversalCents,
      sellerClawbackCents: refundBreakdown.sellerClawbackCents,
      payoutOffsetCents: refundBreakdown.payoutOffsetCents,
      providerId: paidPayment.providerId,
    },
  });

  return c.json({ order: updatedOrder, payment: updatedPayment, refund: orderRefund });
});

export { app as adminRefundRoutes };
