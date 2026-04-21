import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')] as const;

app.get('/v1/seller/shows', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const pageNum = Math.max(1, Number(c.req.query('page') ?? '1'));
  const take = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '20')));
  const skip = (pageNum - 1) * take;
  const [items, total] = await Promise.all([
    prisma.show.findMany({ where: { sellerId: user.id }, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.show.count({ where: { sellerId: user.id } }),
  ]);
  return c.json({ data: items, meta: { total, page: pageNum, perPage: take } });
});

app.post('/v1/seller/shows', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const { title, description, scheduledAt } = await c.req.json<{ title: string; description?: string; scheduledAt?: string }>();
  if (!title || title.trim() === '') return c.json({ statusCode: 400, error: 'Bad Request', message: 'title is required' }, 400);
  const show = await prisma.show.create({
    data: { sellerId: user.id, title: title.trim(), description: description?.trim() ?? null, scheduledAt: scheduledAt ? new Date(scheduledAt) : null },
  });
  return c.json(show, 201);
});

app.get('/v1/seller/shows/:id', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');
  const show = await prisma.show.findUnique({
    where: { id },
    include: { queueItems: { orderBy: { position: 'asc' }, include: { inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } } } } },
  });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  return c.json(show);
});

app.patch('/v1/seller/shows/:id', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');
  const { title, description, scheduledAt } = await c.req.json<{ title?: string; description?: string; scheduledAt?: string | null }>();
  const show = await prisma.show.findUnique({ where: { id } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  if (show.status === 'CANCELLED' || show.status === 'ENDED') {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Cannot edit a cancelled or ended show' }, 409);
  }
  const updated = await prisma.show.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description?.trim() ?? null }),
      ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
    },
  });
  return c.json(updated);
});

app.post('/v1/seller/shows/:id/schedule', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');
  const show = await prisma.show.findUnique({ where: { id } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  if (show.status !== 'DRAFT') return c.json({ statusCode: 409, error: 'Conflict', message: 'Only DRAFT shows can be scheduled' }, 409);
  if (!show.scheduledAt) return c.json({ statusCode: 400, error: 'Bad Request', message: 'scheduledAt must be set before scheduling' }, 400);
  const updated = await prisma.show.update({ where: { id }, data: { status: 'SCHEDULED' } });
  return c.json(updated);
});

app.post('/v1/seller/shows/:id/cancel', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');
  const show = await prisma.show.findUnique({ where: { id } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  if (show.status === 'ENDED' || show.status === 'CANCELLED') {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Show is already ended or cancelled' }, 409);
  }
  const updated = await prisma.show.update({ where: { id }, data: { status: 'CANCELLED' } });
  return c.json(updated);
});

export { app as sellerShowRoutes };
