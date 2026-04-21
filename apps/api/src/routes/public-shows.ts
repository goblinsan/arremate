import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();

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

  const [items, total] = await Promise.all([
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
  ]);

  return c.json({ data: items, meta: { total, page: pageNum, perPage: take } });
});

app.get('/v1/shows/:id', async (c) => {
  const id = c.req.param('id');

  const show = await prisma.show.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      scheduledAt: true,
      createdAt: true,
      seller: { select: { id: true, name: true } },
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
  });

  if (!show || (show.status !== 'SCHEDULED' && show.status !== 'LIVE')) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  }

  return c.json(show);
});

export { app as publicShowRoutes };

