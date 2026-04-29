import { Hono } from 'hono';
import { withPrisma } from '@arremate/database';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const PRESENCE_STALE_MS = 60_000;

function calculateAverageShippingDays(
  orders: Array<{ createdAt: Date; shipment: { shippedAt: Date | null } | null }>,
): number | null {
  const shipped = orders
    .map((order) => {
      if (!order.shipment?.shippedAt) return null;
      const diffMs = order.shipment.shippedAt.getTime() - order.createdAt.getTime();
      return Math.max(0.25, diffMs / (1000 * 60 * 60 * 24));
    })
    .filter((value): value is number => value !== null);

  if (shipped.length === 0) return null;
  return shipped.reduce((sum, value) => sum + value, 0) / shipped.length;
}

/**
 * Public show endpoints (no authentication required).
 *
 * GET /v1/shows           – list upcoming / scheduled shows
 * GET /v1/shows/:id       – public show detail with queue
 */
app.get('/v1/shows', async (c) => {
  const page = c.req.query('page') ?? '1';
  const perPage = c.req.query('perPage') ?? '20';
  const pageNum = Math.max(1, Number(page));
  const take = Math.min(100, Math.max(1, Number(perPage)));
  const skip = (pageNum - 1) * take;

  const [items, total] = await withPrisma((prisma) => Promise.all([
    prisma.show.findMany({
      where: { status: { in: ['SCHEDULED', 'LIVE'] } },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        scheduledAt: true,
        createdAt: true,
        seller: { select: { id: true, name: true } },
        _count: { select: { queueItems: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      skip,
      take,
    }),
    prisma.show.count({ where: { status: { in: ['SCHEDULED', 'LIVE'] } } }),
  ]));

  return c.json({ data: items, meta: { total, page: pageNum, perPage: take } });
});

app.get('/v1/shows/:id', async (c) => {
  const id = c.req.param('id');

  const show = await withPrisma((prisma) => prisma.show.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      scheduledAt: true,
      createdAt: true,
      seller: {
        select: {
          id: true,
          name: true,
          sellerApplication: { select: { businessName: true, brandLogoUrl: true } },
        },
      },
      queueItems: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          position: true,
          inventoryItem: {
            select: {
              id: true,
              title: true,
              description: true,
              condition: true,
              startingPrice: true,
              images: {
                orderBy: { position: 'asc' },
                select: { id: true, s3Key: true, contentType: true, fileName: true, position: true },
              },
            },
          },
        },
      },
    },
  }));

  if (!show || (show.status !== 'SCHEDULED' && show.status !== 'LIVE')) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  }

  const [sellerOrders, sellerReviewAggregate] = await withPrisma((prisma) => Promise.all([
    prisma.order.findMany({
      where: {
        sellerId: show.seller.id,
        status: { in: ['PAID', 'REFUNDED'] },
      },
      select: {
        createdAt: true,
        shipment: { select: { shippedAt: true } },
      },
    }),
    prisma.sellerReview.aggregate({
      where: { sellerId: show.seller.id },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ]));

  const averageShippingDays = calculateAverageShippingDays(sellerOrders);

  return c.json({
    ...show,
    seller: {
      id: show.seller.id,
      name: show.seller.name,
      brandName: show.seller.sellerApplication?.businessName ?? show.seller.name,
      brandLogoUrl: show.seller.sellerApplication?.brandLogoUrl ?? null,
      metrics: {
        ratingAverage: sellerReviewAggregate._avg.rating ?? null,
        ratingCount: sellerReviewAggregate._count.rating,
        averageShippingDays,
        completedSalesCount: sellerOrders.length,
      },
    },
  });
});

app.post('/v1/shows/:id/presence', async (c) => {
  const showId = c.req.param('id');
  const body = await c.req.json<{ viewerKey?: string }>().catch(() => null);
  const viewerKey = body?.viewerKey?.trim();

  if (!viewerKey || viewerKey.length > 120) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'viewerKey is required' }, 400);
  }

  const show = await withPrisma((prisma) => prisma.show.findUnique({
    where: { id: showId },
    select: { id: true, status: true },
  }));
  if (!show || show.status !== 'LIVE') {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Live show not found' }, 404);
  }

  const staleBefore = new Date(Date.now() - PRESENCE_STALE_MS);
  const result = await withPrisma(async (prisma) => {
    await prisma.showPresence.upsert({
      where: { showId_viewerKey: { showId, viewerKey } },
      create: { showId, viewerKey, lastSeenAt: new Date() },
      update: { lastSeenAt: new Date() },
    });

    await prisma.showPresence.deleteMany({
      where: { showId, lastSeenAt: { lt: staleBefore } },
    });

    const viewerCount = await prisma.showPresence.count({
      where: { showId, lastSeenAt: { gte: staleBefore } },
    });

    return { viewerCount };
  });

  return c.json(result);
});

export { app as publicShowRoutes };
