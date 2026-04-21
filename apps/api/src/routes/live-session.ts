import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { createLiveVideoProvider } from '@arremate/video';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')] as const;

app.post('/v1/seller/shows/:showId/go-live', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  if (show.status !== 'SCHEDULED') return c.json({ statusCode: 409, error: 'Conflict', message: 'Only SCHEDULED shows can go live' }, 409);
  const activeSession = await prisma.showSession.findFirst({ where: { showId, status: { in: ['STARTING', 'LIVE'] } } });
  if (activeSession) return c.json({ statusCode: 409, error: 'Conflict', message: 'An active session already exists for this show' }, 409);
  const provider = createLiveVideoProvider(process.env.LIVE_VIDEO_PROVIDER ?? 'stub');
  const providerResult = await provider.createSession(showId);
  const [session] = await prisma.$transaction([
    prisma.showSession.create({
      data: { showId, status: 'LIVE', providerSessionId: providerResult.providerSessionId, playbackUrl: providerResult.playbackUrl ?? null, startedAt: new Date() },
      include: { pinnedItem: { include: { inventoryItem: true } } },
    }),
    prisma.show.update({ where: { id: showId }, data: { status: 'LIVE' } }),
  ]);
  return c.json(session, 201);
});

app.post('/v1/seller/sessions/:sessionId/pin', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');
  const { queueItemId } = await c.req.json<{ queueItemId: string }>();
  if (!queueItemId) return c.json({ statusCode: 400, error: 'Bad Request', message: 'queueItemId is required' }, 400);
  const session = await prisma.showSession.findUnique({ where: { id: sessionId }, include: { show: true } });
  if (!session || session.show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  if (session.status !== 'LIVE') return c.json({ statusCode: 409, error: 'Conflict', message: 'Can only pin items in a LIVE session' }, 409);
  const queueItem = await prisma.showInventoryItem.findUnique({ where: { id: queueItemId } });
  if (!queueItem || queueItem.showId !== session.showId) return c.json({ statusCode: 404, error: 'Not Found', message: 'Queue item not found' }, 404);
  const updated = await prisma.showSession.update({
    where: { id: sessionId },
    data: { pinnedItemId: queueItemId },
    include: { pinnedItem: { include: { inventoryItem: true } } },
  });
  return c.json(updated);
});

app.delete('/v1/seller/sessions/:sessionId/pin', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');
  const session = await prisma.showSession.findUnique({ where: { id: sessionId }, include: { show: true } });
  if (!session || session.show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  if (session.status !== 'LIVE') return c.json({ statusCode: 409, error: 'Conflict', message: 'Can only unpin items in a LIVE session' }, 409);
  const updated = await prisma.showSession.update({
    where: { id: sessionId },
    data: { pinnedItemId: null },
    include: { pinnedItem: { include: { inventoryItem: true } } },
  });
  return c.json(updated);
});

app.patch('/v1/seller/shows/:showId/queue/:itemId/sold-out', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const itemId = c.req.param('itemId');
  const body = await c.req.json<{ soldOut?: boolean }>().catch(() => ({} as { soldOut?: boolean }));
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  if (show.status !== 'LIVE') return c.json({ statusCode: 409, error: 'Conflict', message: 'Can only update availability during a LIVE show' }, 409);
  const queueItem = await prisma.showInventoryItem.findUnique({ where: { id: itemId } });
  if (!queueItem || queueItem.showId !== showId) return c.json({ statusCode: 404, error: 'Not Found', message: 'Queue item not found' }, 404);
  const updated = await prisma.showInventoryItem.update({ where: { id: itemId }, data: { soldOut: body.soldOut ?? true }, include: { inventoryItem: true } });
  return c.json(updated);
});

app.post('/v1/seller/sessions/:sessionId/end', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');
  const session = await prisma.showSession.findUnique({ where: { id: sessionId }, include: { show: true } });
  if (!session || session.show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  if (session.status !== 'LIVE') return c.json({ statusCode: 409, error: 'Conflict', message: 'Only LIVE sessions can be ended' }, 409);
  if (session.providerSessionId) {
    try {
      const provider = createLiveVideoProvider(process.env.LIVE_VIDEO_PROVIDER ?? 'stub');
      await provider.endSession(session.providerSessionId);
    } catch {
      // continue with local state update even if provider call fails
    }
  }
  const [updatedSession] = await prisma.$transaction([
    prisma.showSession.update({
      where: { id: sessionId },
      data: { status: 'ENDED', endedAt: new Date(), pinnedItemId: null },
      include: { pinnedItem: { include: { inventoryItem: true } } },
    }),
    prisma.show.update({ where: { id: session.showId }, data: { status: 'ENDED' } }),
  ]);
  return c.json(updatedSession);
});

app.get('/v1/shows/:showId/session', async (c) => {
  const showId = c.req.param('showId');
  const show = await prisma.show.findUnique({ where: { id: showId }, select: { id: true, status: true } });
  if (!show || !['SCHEDULED', 'LIVE', 'ENDED'].includes(show.status)) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  }
  const session = await prisma.showSession.findFirst({
    where: { showId, status: { in: ['LIVE', 'STARTING'] } },
    orderBy: { createdAt: 'desc' },
    include: { pinnedItem: { include: { inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } } } } },
  });
  if (!session) return c.json({ statusCode: 404, error: 'Not Found', message: 'No active session' }, 404);
  return c.json(session);
});

export { app as liveSessionRoutes };
