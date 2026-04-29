import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { parseBulkInventoryRows } from '../services/bulk-import.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')] as const;

app.get('/v1/seller/shows/:showId/queue', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  const queueItems = await prisma.showInventoryItem.findMany({
    where: { showId },
    orderBy: { position: 'asc' },
    include: { inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } } },
  });
  return c.json(queueItems);
});

app.post('/v1/seller/shows/:showId/queue', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const { inventoryItemId, position } = await c.req.json<{ inventoryItemId: string; position?: number }>();
  if (!inventoryItemId) return c.json({ statusCode: 400, error: 'Bad Request', message: 'inventoryItemId is required' }, 400);
  const [show, inventoryItem] = await Promise.all([
    prisma.show.findUnique({ where: { id: showId } }),
    prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } }),
  ]);
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  if (!inventoryItem || inventoryItem.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Inventory item not found' }, 404);
  let queuePosition = position ?? 0;
  if (position === undefined) {
    const lastItem = await prisma.showInventoryItem.findFirst({ where: { showId }, orderBy: { position: 'desc' } });
    queuePosition = lastItem ? lastItem.position + 1 : 0;
  }
  try {
    const entry = await prisma.showInventoryItem.create({
      data: { showId, inventoryItemId, position: queuePosition },
      include: { inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } } },
    });
    return c.json(entry, 201);
  } catch (err) {
    const error = err as { code?: string };
    if (error?.code === 'P2002') return c.json({ statusCode: 409, error: 'Conflict', message: 'This item is already in the queue' }, 409);
    throw err;
  }
});

app.post('/v1/seller/shows/:showId/queue/bulk-import', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const { rowsText } = await c.req.json<{ rowsText?: string }>();

  if (typeof rowsText !== 'string' || rowsText.trim() === '') {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'rowsText is required' }, 400);
  }

  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  }
  if (show.status === 'CANCELLED' || show.status === 'ENDED') {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Cannot import items into a cancelled or ended show' }, 409);
  }

  let rows;
  try {
    rows = parseBulkInventoryRows(rowsText);
  } catch (err) {
    return c.json({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: err instanceof Error ? err.message : 'Não foi possível interpretar o arquivo.',
    }, 422);
  }

  const createdEntries = await prisma.$transaction(async (tx) => {
    const lastItem = await tx.showInventoryItem.findFirst({
      where: { showId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    let nextPosition = lastItem ? lastItem.position + 1 : 0;
    const entries = [];

    for (const row of rows) {
      const inventoryItem = await tx.inventoryItem.create({
        data: {
          sellerId: user.id,
          title: row.title,
          description: row.description,
          condition: row.condition,
          startingPrice: row.startingPrice,
        },
      });

      const entry = await tx.showInventoryItem.create({
        data: {
          showId,
          inventoryItemId: inventoryItem.id,
          position: nextPosition,
        },
        include: {
          inventoryItem: {
            include: {
              images: { orderBy: { position: 'asc' } },
            },
          },
        },
      });

      entries.push(entry);
      nextPosition += 1;
    }

    return entries;
  });

  return c.json({ createdCount: createdEntries.length, entries: createdEntries }, 201);
});

app.delete('/v1/seller/shows/:showId/queue/:itemId', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const itemId = c.req.param('itemId');
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  const entry = await prisma.showInventoryItem.findUnique({ where: { id: itemId } });
  if (!entry || entry.showId !== showId) return c.json({ statusCode: 404, error: 'Not Found', message: 'Queue entry not found' }, 404);
  await prisma.showInventoryItem.delete({ where: { id: itemId } });
  return c.body(null, 204);
});

app.patch('/v1/seller/shows/:showId/queue/reorder', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const { order } = await c.req.json<{ order: string[] }>();
  if (!Array.isArray(order)) return c.json({ statusCode: 400, error: 'Bad Request', message: 'order must be an array of queue entry IDs' }, 400);
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  await prisma.$transaction(order.map((entryId, index) => prisma.showInventoryItem.updateMany({ where: { id: entryId, showId }, data: { position: index } })));
  const updated = await prisma.showInventoryItem.findMany({
    where: { showId },
    orderBy: { position: 'asc' },
    include: { inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } } },
  });
  return c.json(updated);
});

export { app as showQueueRoutes };
