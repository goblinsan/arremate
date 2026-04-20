import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';

const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')];
const buyerGuard = [authenticate];

/**
 * Fulfillment and support routes.
 *
 * GET  /v1/orders/:orderId                          – get order detail (buyer or seller)
 * PUT  /v1/orders/:orderId/shipment                 – upsert shipment record (seller/admin)
 * POST /v1/orders/:orderId/support-tickets          – create support ticket (buyer)
 * GET  /v1/buyer/support-tickets                    – list buyer's support tickets
 */
export async function fulfillmentRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Get order detail ─────────────────────────────────────────────────────────
  fastify.get(
    '/v1/orders/:orderId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;
      const { orderId } = request.params as { orderId: string };

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: { select: { id: true, name: true, email: true } },
          seller: { select: { id: true, name: true, email: true } },
          lines: { include: { inventoryItem: true } },
          payments: true,
          shipment: true,
          supportTickets: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!order) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Order not found' });
      }

      // Only the buyer, the seller, or an admin may view the order
      if (user.role !== 'ADMIN' && order.buyerId !== user.id && order.sellerId !== user.id) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied' });
      }

      return reply.send(order);
    },
  );

  // ─── Upsert shipment (seller / admin) ────────────────────────────────────────
  fastify.put(
    '/v1/orders/:orderId/shipment',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { orderId } = request.params as { orderId: string };

      const order = await prisma.order.findUnique({ where: { id: orderId } });

      if (!order) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Order not found' });
      }

      if (user.role !== 'ADMIN' && order.sellerId !== user.id) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied' });
      }

      const {
        status,
        carrier,
        trackingNumber,
        trackingUrl,
        estimatedDelivery,
        shippedAt,
        deliveredAt,
      } = request.body as {
        status?: string;
        carrier?: string;
        trackingNumber?: string;
        trackingUrl?: string;
        estimatedDelivery?: string;
        shippedAt?: string;
        deliveredAt?: string;
      };

      const validStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURNED'];
      if (status && !validStatuses.includes(status)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const shipment = await prisma.shipment.upsert({
        where: { orderId },
        create: {
          orderId,
          status: (status as 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'RETURNED') ?? 'PENDING',
          carrier: carrier ?? null,
          trackingNumber: trackingNumber ?? null,
          trackingUrl: trackingUrl ?? null,
          estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
          shippedAt: shippedAt ? new Date(shippedAt) : null,
          deliveredAt: deliveredAt ? new Date(deliveredAt) : null,
        },
        update: {
          ...(status && { status: status as 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'RETURNED' }),
          ...(carrier !== undefined && { carrier }),
          ...(trackingNumber !== undefined && { trackingNumber }),
          ...(trackingUrl !== undefined && { trackingUrl }),
          ...(estimatedDelivery !== undefined && {
            estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
          }),
          ...(shippedAt !== undefined && { shippedAt: shippedAt ? new Date(shippedAt) : null }),
          ...(deliveredAt !== undefined && { deliveredAt: deliveredAt ? new Date(deliveredAt) : null }),
        },
      });

      return reply.send(shipment);
    },
  );

  // ─── Create support ticket (buyer) ───────────────────────────────────────────
  fastify.post(
    '/v1/orders/:orderId/support-tickets',
    { preHandler: buyerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { orderId } = request.params as { orderId: string };

      const order = await prisma.order.findUnique({ where: { id: orderId } });

      if (!order || order.buyerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Order not found' });
      }

      const { subject, message } = request.body as { subject?: string; message?: string };

      if (!subject || subject.trim().length === 0) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Subject is required' });
      }

      if (!message || message.trim().length === 0) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Message is required' });
      }

      const ticket = await prisma.supportTicket.create({
        data: {
          orderId,
          userId: user.id,
          subject: subject.trim(),
          message: message.trim(),
          status: 'OPEN',
        },
      });

      return reply.status(201).send(ticket);
    },
  );

  // ─── List buyer support tickets ───────────────────────────────────────────────
  fastify.get(
    '/v1/buyer/support-tickets',
    { preHandler: buyerGuard },
    async (request, reply) => {
      const user = request.currentUser!;

      const tickets = await prisma.supportTicket.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              status: true,
              totalCents: true,
              lines: { select: { title: true }, take: 1 },
            },
          },
        },
      });

      return reply.send(tickets);
    },
  );
}
