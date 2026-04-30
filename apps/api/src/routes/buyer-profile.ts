import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();

/**
 * GET /v1/buyer/bids
 *
 * Returns the authenticated buyer's live bid history across all shows,
 * ordered newest first.
 */
app.get('/v1/buyer/bids', authenticate, async (c) => {
  const user = c.get('currentUser');
  const pageNum = Math.max(1, Number(c.req.query('page') ?? '1'));
  const take = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '20')));
  const skip = (pageNum - 1) * take;

  const [bids, total] = await Promise.all([
    prisma.liveBid.findMany({
      where: { bidderId: user.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        queueItem: {
          include: {
            inventoryItem: { select: { id: true, title: true } },
            show: { select: { id: true, title: true, status: true } },
          },
        },
        session: { select: { id: true, status: true } },
      },
    }),
    prisma.liveBid.count({ where: { bidderId: user.id } }),
  ]);

  return c.json({ data: bids, meta: { total, page: pageNum, perPage: take } });
});

/**
 * GET /v1/buyer/saved-shows
 *
 * Returns the list of shows saved (bookmarked) by the authenticated buyer,
 * ordered by when they were saved (newest first).
 */
app.get('/v1/buyer/saved-shows', authenticate, async (c) => {
  const user = c.get('currentUser');
  const pageNum = Math.max(1, Number(c.req.query('page') ?? '1'));
  const take = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '20')));
  const skip = (pageNum - 1) * take;

  const [savedShows, total] = await Promise.all([
    prisma.savedShow.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        show: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            scheduledAt: true,
            seller: { select: { id: true, name: true } },
            _count: { select: { queueItems: true } },
          },
        },
      },
    }),
    prisma.savedShow.count({ where: { userId: user.id } }),
  ]);

  return c.json({ data: savedShows, meta: { total, page: pageNum, perPage: take } });
});

/**
 * POST /v1/buyer/saved-shows/:showId
 *
 * Saves (bookmarks) a show for the authenticated buyer.
 * Returns 201 on creation or 200 if already saved.
 */
app.post('/v1/buyer/saved-shows/:showId', authenticate, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');

  const show = await prisma.show.findUnique({ where: { id: showId }, select: { id: true } });
  if (!show) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  }

  const existing = await prisma.savedShow.findUnique({
    where: { userId_showId: { userId: user.id, showId } },
  });
  if (existing) {
    return c.json(existing, 200);
  }

  const saved = await prisma.savedShow.create({
    data: { userId: user.id, showId },
  });
  return c.json(saved, 201);
});

/**
 * DELETE /v1/buyer/saved-shows/:showId
 *
 * Removes a saved (bookmarked) show for the authenticated buyer.
 */
app.delete('/v1/buyer/saved-shows/:showId', authenticate, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');

  const existing = await prisma.savedShow.findUnique({
    where: { userId_showId: { userId: user.id, showId } },
  });
  if (!existing) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Saved show not found' }, 404);
  }

  await prisma.savedShow.delete({
    where: { userId_showId: { userId: user.id, showId } },
  });

  return c.body(null, 204);
});

/**
 * GET /v1/buyer/account-health
 *
 * Returns a summary of the buyer's account health, including order statistics
 * and payment activity.
 */
app.get('/v1/buyer/account-health', authenticate, async (c) => {
  const user = c.get('currentUser');

  const [orderStats, recentOrders] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { buyerId: user.id },
      _count: { id: true },
    }),
    prisma.order.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { createdAt: true },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  let totalOrders = 0;
  for (const row of orderStats) {
    statusCounts[row.status] = row._count.id;
    totalOrders += row._count.id;
  }

  const paidOrders = statusCounts['PAID'] ?? 0;
  const cancelledOrders = statusCounts['CANCELLED'] ?? 0;
  const refundedOrders = statusCounts['REFUNDED'] ?? 0;
  const pendingOrders = statusCounts['PENDING_PAYMENT'] ?? 0;

  // Completion rate: paid / (paid + cancelled + refunded), or null when no closed orders
  const closedOrders = paidOrders + cancelledOrders + refundedOrders;
  const completionRate = closedOrders > 0 ? Math.round((paidOrders / closedOrders) * 100) : null;

  // Simple health score: 100 if no activity or all paid; decreases proportionally with cancellations
  let healthScore: number | null = null;
  if (closedOrders > 0) {
    healthScore = Math.round((paidOrders / closedOrders) * 100);
  }

  return c.json({
    totalOrders,
    paidOrders,
    pendingOrders,
    cancelledOrders,
    refundedOrders,
    completionRate,
    healthScore,
    lastOrderAt: recentOrders[0]?.createdAt ?? null,
  });
});

export { app as buyerProfileRoutes };
