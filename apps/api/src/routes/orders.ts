import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { createPixAdapter } from '@arremate/payments';
import { logger, trackEvent, TelemetryEvents } from '@arremate/observability';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { evaluateFee } from '../services/fee-evaluator.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')] as const;

app.post('/v1/claims/:claimId/order', authenticate, async (c) => {
  const user = c.get('currentUser');
  const claimId = c.req.param('claimId');
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { queueItem: { include: { inventoryItem: true, show: true } }, order: true },
  });
  if (!claim || claim.buyerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Claim not found' }, 404);
  if (claim.status === 'PENDING' && claim.expiresAt < new Date()) {
    await prisma.claim.update({ where: { id: claimId }, data: { status: 'EXPIRED' } });
    return c.json({ statusCode: 409, error: 'Conflict', message: 'This claim has expired' }, 409);
  }
  if (claim.status === 'EXPIRED') return c.json({ statusCode: 409, error: 'Conflict', message: 'This claim has expired' }, 409);
  if (claim.status === 'CANCELLED') return c.json({ statusCode: 409, error: 'Conflict', message: 'This claim has been cancelled' }, 409);
  if (claim.order) {
    const existingOrder = await prisma.order.findUnique({ where: { id: claim.order.id }, include: { lines: { include: { inventoryItem: true } }, payments: true } });
    return c.json(existingOrder);
  }
  const sellerId = claim.queueItem.inventoryItem.sellerId;
  const priceCents = Math.round(Number(claim.priceAtClaim) * 100);

  // Evaluate and snapshot fees at the moment of order creation
  let feeData: {
    feeConfigVersionId: string;
    feeConfigVersion: number;
    subtotalCents: number;
    commissionBps: number;
    commissionCents: number;
    processorFeeBps: number;
    processorFeeCents: number;
    shippingCents: number;
    buyerTotalCents: number;
    sellerPayoutCents: number;
    promotionCode: string | null;
    promotionDiscountBps: number;
    sellerOverrideApplied: boolean;
  } | null = null;
  try {
    const breakdown = await evaluateFee({ subtotalCents: priceCents, sellerId });
    feeData = {
      feeConfigVersionId: breakdown.configVersionId,
      feeConfigVersion: breakdown.configVersion,
      subtotalCents: breakdown.subtotalCents,
      commissionBps: breakdown.commissionBps,
      commissionCents: breakdown.commissionCents,
      processorFeeBps: breakdown.processorFeeBps,
      processorFeeCents: breakdown.processorFeeCents,
      shippingCents: breakdown.shippingCents,
      buyerTotalCents: breakdown.totalBuyerCents,
      sellerPayoutCents: breakdown.sellerPayoutCents,
      promotionCode: breakdown.promotionCode,
      promotionDiscountBps: breakdown.promotionDiscountBps,
      sellerOverrideApplied: breakdown.sellerOverrideApplied,
    };
  } catch (err) {
    // No active fee config or evaluation failed — order proceeds without snapshot.
    // Fee fields will be null on this order and refunds will fall back to totalCents.
    logger.warn('Fee evaluation failed; order created without fee snapshot', { claimId, err: err instanceof Error ? err.message : String(err) });
  }

  const order = await prisma.$transaction(async (tx) => {
    const createdOrder = await tx.order.create({
      data: {
        claimId: claim.id, buyerId: user.id, sellerId, totalCents: priceCents, status: 'PENDING_PAYMENT',
        ...(feeData ?? {}),
        lines: { create: { inventoryItemId: claim.queueItem.inventoryItemId, title: claim.queueItem.inventoryItem.title, priceCents, quantity: 1 } },
      },
      include: { lines: { include: { inventoryItem: true } }, payments: true },
    });

    await tx.claim.update({ where: { id: claimId }, data: { status: 'CONFIRMED' } });

    return createdOrder;
  });
  return c.json(order, 201);
});

/**
 * Returns the canonical charge amount for an order.
 * Prefers the stored buyerTotalCents snapshot (subtotal + shipping) over the
 * legacy totalCents field so that the PSP charge always matches the intended
 * buyer-collected amount.
 */
export function resolveChargeAmount(order: { totalCents: number; buyerTotalCents: number | null }): number {
  return order.buyerTotalCents ?? order.totalCents;
}

app.post('/v1/orders/:orderId/pix-payment', authenticate, async (c) => {
  const user = c.get('currentUser');
  const orderId = c.req.param('orderId');
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
  if (!order || order.buyerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Order not found' }, 404);
  if (order.status !== 'PENDING_PAYMENT') return c.json({ statusCode: 409, error: 'Conflict', message: `Order is already ${order.status}` }, 409);
  const existingPayment = order.payments.find((p) => p.status === 'PENDING' && p.pixCode);
  if (existingPayment) return c.json(existingPayment);
  const chargeAmountCents = resolveChargeAmount(order);
  const pixAdapter = createPixAdapter();
  let charge;
  try {
    charge = await pixAdapter.createPixCharge({
      amountCents: chargeAmountCents, orderId: order.id,
      description: `Pedido Arremate #${order.id.slice(-8).toUpperCase()}`,
      expiresInMinutes: 30,
    });
  } catch (err) {
    trackEvent(TelemetryEvents.PAYMENT_CREATION_FAILED, {
      orderId: order.id,
      amountCents: chargeAmountCents,
      provider: 'pix',
      reason: err instanceof Error ? err.message : 'unknown',
    });
    throw err;
  }
  const payment = await prisma.payment.create({
    data: { orderId: order.id, status: 'PENDING', provider: 'pix', amountCents: chargeAmountCents, providerId: charge.providerId, pixCode: charge.pixCode, pixQrCodeBase64: charge.pixQrCodeBase64, pixExpiresAt: charge.expiresAt },
  });
  trackEvent(TelemetryEvents.PAYMENT_CREATED, {
    orderId: order.id,
    paymentId: payment.id,
    amountCents: chargeAmountCents,
    provider: 'pix',
  });
  return c.json(payment, 201);
});

app.get('/v1/buyer/orders', authenticate, async (c) => {
  const user = c.get('currentUser');
  const orders = await prisma.order.findMany({
    where: { buyerId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { lines: { include: { inventoryItem: true } }, payments: true, shipment: true },
  });
  return c.json(orders);
});

app.get('/v1/seller/orders', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const status = c.req.query('status');
  const where: { sellerId: string; status?: 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'REFUNDED' } = { sellerId: user.id };
  if (status === 'PAID' || status === 'PENDING_PAYMENT' || status === 'CANCELLED' || status === 'REFUNDED') where.status = status;
  const orders = await prisma.order.findMany({
    where, orderBy: { createdAt: 'desc' },
    include: { buyer: { select: { id: true, name: true, email: true } }, lines: { include: { inventoryItem: true } }, payments: true, shipment: true },
  });
  return c.json(orders);
});

export { app as orderRoutes };
