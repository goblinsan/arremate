import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { createPixAdapter } from '@arremate/payments';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';

const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')];

/**
 * Order and payment routes.
 *
 * POST /v1/claims/:claimId/order              – create order from a valid claim (buyer)
 * POST /v1/orders/:orderId/pix-payment        – create a Pix charge for the order (buyer)
 * GET  /v1/buyer/orders                       – list buyer's orders
 * GET  /v1/seller/orders                      – list seller's paid orders
 */
export async function orderRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Create order from claim (buyer) ─────────────────────────────────────────
  fastify.post(
    '/v1/claims/:claimId/order',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;
      const { claimId } = request.params as { claimId: string };

      const claim = await prisma.claim.findUnique({
        where: { id: claimId },
        include: {
          queueItem: {
            include: {
              inventoryItem: true,
              show: true,
            },
          },
          order: true,
        },
      });

      if (!claim || claim.buyerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Claim not found' });
      }

      // Lazily expire if overdue
      if (claim.status === 'PENDING' && claim.expiresAt < new Date()) {
        await prisma.claim.update({ where: { id: claimId }, data: { status: 'EXPIRED' } });
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'This claim has expired',
        });
      }

      if (claim.status === 'EXPIRED') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'This claim has expired',
        });
      }

      if (claim.status === 'CANCELLED') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'This claim has been cancelled',
        });
      }

      // Idempotent: return existing order if already created
      if (claim.order) {
        const existingOrder = await prisma.order.findUnique({
          where: { id: claim.order.id },
          include: { lines: { include: { inventoryItem: true } }, payments: true },
        });
        return reply.send(existingOrder);
      }

      const sellerId = claim.queueItem.inventoryItem.sellerId;
      const priceCents = Math.round(Number(claim.priceAtClaim) * 100);

      // Create order + line atomically and transition claim to CONFIRMED
      const [order] = await prisma.$transaction([
        prisma.order.create({
          data: {
            claimId: claim.id,
            buyerId: user.id,
            sellerId,
            totalCents: priceCents,
            status: 'PENDING_PAYMENT',
            lines: {
              create: {
                inventoryItemId: claim.queueItem.inventoryItemId,
                title: claim.queueItem.inventoryItem.title,
                priceCents,
                quantity: 1,
              },
            },
          },
          include: {
            lines: { include: { inventoryItem: true } },
            payments: true,
          },
        }),
        prisma.claim.update({
          where: { id: claimId },
          data: { status: 'CONFIRMED' },
        }),
      ]);

      return reply.status(201).send(order);
    },
  );

  // ─── Create Pix payment for order (buyer) ────────────────────────────────────
  fastify.post(
    '/v1/orders/:orderId/pix-payment',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;
      const { orderId } = request.params as { orderId: string };

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { payments: true },
      });

      if (!order || order.buyerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Order not found' });
      }

      if (order.status !== 'PENDING_PAYMENT') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: `Order is already ${order.status}`,
        });
      }

      // Idempotent: return existing pending payment if one already exists
      const existingPayment = order.payments.find((p) => p.status === 'PENDING' && p.pixCode);
      if (existingPayment) {
        return reply.send(existingPayment);
      }

      // Generate Pix charge via the configured provider
      const pixAdapter = createPixAdapter();
      const charge = await pixAdapter.createPixCharge({
        amountCents: order.totalCents,
        orderId: order.id,
        description: `Pedido Arremate #${order.id.slice(-8).toUpperCase()}`,
        expiresInMinutes: 30,
      });

      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          status: 'PENDING',
          provider: 'pix',
          amountCents: order.totalCents,
          providerId: charge.providerId,
          pixCode: charge.pixCode,
          pixQrCodeBase64: charge.pixQrCodeBase64,
          pixExpiresAt: charge.expiresAt,
        },
      });

      return reply.status(201).send(payment);
    },
  );

  // ─── List buyer orders ────────────────────────────────────────────────────────
  fastify.get(
    '/v1/buyer/orders',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;

      const orders = await prisma.order.findMany({
        where: { buyerId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          lines: { include: { inventoryItem: true } },
          payments: true,
          shipment: true,
        },
      });

      return reply.send(orders);
    },
  );

  // ─── List seller orders ───────────────────────────────────────────────────────
  fastify.get(
    '/v1/seller/orders',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { status } = request.query as { status?: string };

      const where: { sellerId: string; status?: 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'REFUNDED' } = {
        sellerId: user.id,
      };

      if (status === 'PAID' || status === 'PENDING_PAYMENT' || status === 'CANCELLED' || status === 'REFUNDED') {
        where.status = status;
      }

      const orders = await prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          buyer: { select: { id: true, name: true, email: true } },
          lines: { include: { inventoryItem: true } },
          payments: true,
          shipment: true,
        },
      });

      return reply.send(orders);
    },
  );
}
