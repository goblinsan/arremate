import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

app.post('/v1/orders/:orderId/dispute', authenticate, async (c) => {
  const user = c.get('currentUser');
  const orderId = c.req.param('orderId');
  const body = await c.req.json<{ reason?: string; description?: string }>().catch(() => ({} as { reason?: string; description?: string }));
  const { reason, description } = body;
  if (!reason) return c.json({ statusCode: 400, error: 'Bad Request', message: 'reason is required' }, 400);
  const validReasons = ['ITEM_NOT_RECEIVED', 'ITEM_NOT_AS_DESCRIBED', 'PAYMENT_ISSUE', 'OTHER'];
  if (!validReasons.includes(reason)) return c.json({ statusCode: 400, error: 'Bad Request', message: `reason must be one of: ${validReasons.join(', ')}` }, 400);
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return c.json({ statusCode: 404, error: 'Not Found', message: 'Order not found' }, 404);
  if (order.buyerId !== user.id && user.role !== 'ADMIN') return c.json({ statusCode: 403, error: 'Forbidden', message: 'Access denied' }, 403);
  if (!['PAID', 'REFUNDED'].includes(order.status)) return c.json({ statusCode: 409, error: 'Conflict', message: 'Can only raise a dispute on a paid order' }, 409);
  const dispute = await prisma.dispute.create({
    data: { orderId, raisedById: user.id, reason: reason as 'ITEM_NOT_RECEIVED' | 'ITEM_NOT_AS_DESCRIBED' | 'PAYMENT_ISSUE' | 'OTHER', description: description ?? null },
    include: { order: { select: { id: true, totalCents: true, status: true } }, raisedBy: { select: { id: true, name: true, email: true } } },
  });
  await createAuditEvent({ action: 'DISPUTE_RAISED', actorId: user.id, metadata: { disputeId: dispute.id, orderId, reason } });
  return c.json(dispute, 201);
});

app.get('/v1/admin/disputes', ...adminGuard, async (c) => {
  const status = c.req.query('status');
  const reason = c.req.query('reason');
  const pageNum = Math.max(1, Number(c.req.query('page') ?? '1'));
  const take = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '20')));
  const skip = (pageNum - 1) * take;
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (reason) where.reason = reason;
  const [items, total] = await Promise.all([
    prisma.dispute.findMany({
      where, include: { order: { select: { id: true, totalCents: true, status: true } }, raisedBy: { select: { id: true, name: true, email: true } }, resolvedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' }, skip, take,
    }),
    prisma.dispute.count({ where }),
  ]);
  return c.json({ data: items, meta: { total, page: pageNum, perPage: take } });
});

app.get('/v1/admin/disputes/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: { order: { include: { buyer: { select: { id: true, name: true, email: true } }, seller: { select: { id: true, name: true, email: true } }, lines: true, payments: { select: { id: true, status: true, amountCents: true, providerId: true } } } }, raisedBy: { select: { id: true, name: true, email: true } }, resolvedBy: { select: { id: true, name: true, email: true } } },
  });
  if (!dispute) return c.json({ statusCode: 404, error: 'Not Found', message: 'Dispute not found' }, 404);
  return c.json(dispute);
});

app.post('/v1/admin/disputes/:id/resolve', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');
  const { resolution } = await c.req.json<{ resolution?: string }>().catch(() => ({} as { resolution?: string }));
  const dispute = await prisma.dispute.findUnique({ where: { id } });
  if (!dispute) return c.json({ statusCode: 404, error: 'Not Found', message: 'Dispute not found' }, 404);
  if (['RESOLVED', 'CLOSED'].includes(dispute.status)) {
    return c.json({ statusCode: 409, error: 'Conflict', message: `Cannot resolve a dispute with status: ${dispute.status}` }, 409);
  }
  const updated = await prisma.dispute.update({
    where: { id },
    data: { status: 'RESOLVED', resolvedById: admin.id, resolution: resolution ?? null, resolvedAt: new Date() },
    include: { order: { select: { id: true, totalCents: true, status: true } }, raisedBy: { select: { id: true, name: true, email: true } }, resolvedBy: { select: { id: true, name: true, email: true } } },
  });
  await createAuditEvent({ action: 'DISPUTE_RESOLVED', actorId: admin.id, metadata: { disputeId: id, resolution: resolution ?? null } });
  return c.json(updated);
});

export { app as adminDisputeRoutes };
