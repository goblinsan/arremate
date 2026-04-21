import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')] as const;

app.get('/v1/orders/:orderId', authenticate, async (c) => {
  const user = c.get('currentUser');
  const orderId = c.req.param('orderId');
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { buyer: { select: { id: true, name: true, email: true } }, seller: { select: { id: true, name: true, email: true } }, lines: { include: { inventoryItem: true } }, payments: true, shipment: true, supportTickets: { orderBy: { createdAt: 'desc' } } },
  });
  if (!order) return c.json({ statusCode: 404, error: 'Not Found', message: 'Order not found' }, 404);
  if (user.role !== 'ADMIN' && order.buyerId !== user.id && order.sellerId !== user.id) {
    return c.json({ statusCode: 403, error: 'Forbidden', message: 'Access denied' }, 403);
  }
  return c.json(order);
});

app.put('/v1/orders/:orderId/shipment', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const orderId = c.req.param('orderId');
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return c.json({ statusCode: 404, error: 'Not Found', message: 'Order not found' }, 404);
  if (user.role !== 'ADMIN' && order.sellerId !== user.id) return c.json({ statusCode: 403, error: 'Forbidden', message: 'Access denied' }, 403);
  const { status, carrier, trackingNumber, trackingUrl, estimatedDelivery, shippedAt, deliveredAt } = await c.req.json<{
    status?: string; carrier?: string; trackingNumber?: string; trackingUrl?: string; estimatedDelivery?: string; shippedAt?: string; deliveredAt?: string;
  }>();
  const validStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURNED'];
  if (status && !validStatuses.includes(status)) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400);
  }
  const shipment = await prisma.shipment.upsert({
    where: { orderId },
    create: { orderId, status: (status as 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'RETURNED') ?? 'PENDING', carrier: carrier ?? null, trackingNumber: trackingNumber ?? null, trackingUrl: trackingUrl ?? null, estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null, shippedAt: shippedAt ? new Date(shippedAt) : null, deliveredAt: deliveredAt ? new Date(deliveredAt) : null },
    update: { ...(status && { status: status as 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'RETURNED' }), ...(carrier !== undefined && { carrier }), ...(trackingNumber !== undefined && { trackingNumber }), ...(trackingUrl !== undefined && { trackingUrl }), ...(estimatedDelivery !== undefined && { estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null }), ...(shippedAt !== undefined && { shippedAt: shippedAt ? new Date(shippedAt) : null }), ...(deliveredAt !== undefined && { deliveredAt: deliveredAt ? new Date(deliveredAt) : null }) },
  });
  return c.json(shipment);
});

app.post('/v1/orders/:orderId/support-tickets', authenticate, async (c) => {
  const user = c.get('currentUser');
  const orderId = c.req.param('orderId');
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return c.json({ statusCode: 404, error: 'Not Found', message: 'Order not found' }, 404);
  if (order.buyerId !== user.id) return c.json({ statusCode: 403, error: 'Forbidden', message: 'Access denied' }, 403);
  const { subject, message } = await c.req.json<{ subject?: string; message?: string }>();
  if (!subject || subject.trim().length === 0) return c.json({ statusCode: 400, error: 'Bad Request', message: 'Subject is required' }, 400);
  if (!message || message.trim().length === 0) return c.json({ statusCode: 400, error: 'Bad Request', message: 'Message is required' }, 400);
  const ticket = await prisma.supportTicket.create({ data: { orderId, userId: user.id, subject: subject.trim(), message: message.trim(), status: 'OPEN' } });
  return c.json(ticket, 201);
});

app.get('/v1/buyer/support-tickets', authenticate, async (c) => {
  const user = c.get('currentUser');
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { order: { select: { id: true, status: true, totalCents: true, lines: { select: { title: true }, take: 1 } } } },
  });
  return c.json(tickets);
});

export { app as fulfillmentRoutes };
