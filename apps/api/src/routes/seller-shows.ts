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

app.delete('/v1/seller/shows/:id', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');
  const show = await prisma.show.findUnique({
    where: { id },
    include: {
      sessions: {
        select: {
          id: true,
          status: true,
          claims: { select: { id: true } },
        },
      },
    },
  });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  if (show.status === 'LIVE' || show.status === 'SCHEDULED') {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Only draft, cancelled, or ended shows can be deleted' }, 409);
  }

  const hasProtectedCommerceHistory = show.sessions.some((session) => session.claims.length > 0);
  if (hasProtectedCommerceHistory) {
    return c.json({
      statusCode: 409,
      error: 'Conflict',
      message: 'This show cannot be deleted because it has buyer claims or order history attached.',
    }, 409);
  }

  const sessionIds = show.sessions.map((session) => session.id);

  await prisma.$transaction(async (tx) => {
    if (sessionIds.length > 0) {
      await tx.chatMessage.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.liveBid.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.showSession.deleteMany({ where: { id: { in: sessionIds } } });
    }

    await tx.show.delete({ where: { id: show.id } });
  });

  return c.body(null, 204);
});

// ─── Show Analytics ──────────────────────────────────────────────────────────

app.get('/v1/seller/shows/:id/analytics', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');

  const show = await prisma.show.findUnique({ where: { id } });
  if (!show || show.sellerId !== user.id) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  }
  if (show.status !== 'ENDED') {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Analytics are only available for ended shows' }, 409);
  }

  const sessions = await prisma.showSession.findMany({
    where: { showId: id },
    select: { id: true, startedAt: true, endedAt: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  const orders = await prisma.order.findMany({
    where: { claim: { sessionId: { in: sessionIds } } },
    select: {
      id: true,
      buyerId: true,
      status: true,
      totalCents: true,
      sellerPayoutCents: true,
      createdAt: true,
      review: { select: { rating: true } },
    },
  });

  // Sales metrics
  const estimatedSalesCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
  const completedEarningsCents = orders
    .filter((o) => o.status === 'PAID')
    .reduce((sum, o) => sum + (o.sellerPayoutCents ?? 0), 0);
  const totalOrders = orders.length;
  const averageOrderValueCents = totalOrders > 0 ? Math.round(estimatedSalesCents / totalOrders) : 0;

  // Stream metrics — buyers
  const buyerIds = [...new Set(orders.map((o) => o.buyerId))];
  const totalBuyers = buyerIds.length;

  const showStartedAt = sessions.reduce<Date | null>((earliest, s) => {
    if (!s.startedAt) return earliest;
    if (!earliest || s.startedAt < earliest) return s.startedAt;
    return earliest;
  }, null);

  let firstTimeBuyers = totalBuyers;
  if (buyerIds.length > 0 && showStartedAt) {
    const priorBuyers = await prisma.order.findMany({
      where: {
        sellerId: user.id,
        buyerId: { in: buyerIds },
        status: 'PAID',
        createdAt: { lt: showStartedAt },
      },
      select: { buyerId: true },
      distinct: ['buyerId'],
    });
    const priorBuyerSet = new Set(priorBuyers.map((o) => o.buyerId));
    firstTimeBuyers = buyerIds.filter((bid) => !priorBuyerSet.has(bid)).length;
  }
  const returningBuyers = totalBuyers - firstTimeBuyers;

  // Show duration
  let showDurationSeconds: number | null = null;
  for (const session of sessions) {
    if (session.startedAt && session.endedAt) {
      const durationSec = Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000);
      if (showDurationSeconds === null || durationSec > showDurationSeconds) {
        showDurationSeconds = durationSec;
      }
    }
  }

  // Views
  const totalViews = await prisma.showPresence.count({ where: { showId: id } });

  // Average order rating
  const ratings = orders.filter((o) => o.review !== null).map((o) => o.review!.rating);
  const averageOrderRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10
      : null;

  return c.json({
    showId: show.id,
    showTitle: show.title,
    showStatus: show.status,
    salesMetrics: {
      estimatedSalesCents,
      completedEarningsCents,
      totalOrders,
      averageOrderValueCents,
      giveawaySpendCents: 0,
      giveaways: 0,
    },
    streamMetrics: {
      totalBuyers,
      firstTimeBuyers,
      returningBuyers,
      shares: 0,
      showDurationSeconds,
      maxConcurrentViewers: null,
      totalViews,
      averageOrderRating,
    },
  });
});

export { app as sellerShowRoutes };
