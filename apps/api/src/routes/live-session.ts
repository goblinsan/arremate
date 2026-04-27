import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { createLiveVideoProvider } from '@arremate/video';
import { randomInt } from 'node:crypto';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')] as const;
const MIN_BID_INCREMENT = 1;

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

app.post('/v1/seller/shows/:showId/go-live', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  if (show.status !== 'SCHEDULED') return c.json({ statusCode: 409, error: 'Conflict', message: 'Only SCHEDULED shows can go live' }, 409);
  const activeSession = await prisma.showSession.findFirst({ where: { showId, status: { in: ['STARTING', 'LIVE'] } } });
  if (activeSession) return c.json({ statusCode: 409, error: 'Conflict', message: 'An active session already exists for this show' }, 409);
  const providerName = process.env.LIVE_VIDEO_PROVIDER ?? 'stub';
  if (providerName === 'stub' && process.env.NODE_ENV === 'production') {
    return c.json({ statusCode: 503, error: 'Service Unavailable', message: 'Servidor de transmissão não configurado. Defina LIVE_VIDEO_PROVIDER no ambiente de produção.' }, 503);
  }
  const provider = createLiveVideoProvider(providerName);
  const broadcast = await provider.prepareBroadcast(showId);
  const ingestMode = broadcast.publishUrl ? 'NATIVE_WEBRTC' : 'RTMP_EXTERNAL';
  const session = await prisma.$transaction(async (tx) => {
    const createdSession = await tx.showSession.create({
      data: {
        showId,
        status: 'LIVE',
        providerSessionId: broadcast.providerSessionId,
        playbackUrl: broadcast.playbackUrl ?? null,
        publishUrl: broadcast.publishUrl ?? null,
        ingestMode,
        providerName,
        startedAt: new Date(),
      },
      include: { pinnedItem: { include: { inventoryItem: true } } },
    });
    await tx.show.update({ where: { id: showId }, data: { status: 'LIVE' } });
    return createdSession;
  });
  return c.json({
    session,
    broadcast: {
      mode: ingestMode,
      provider: providerName,
      publishUrl: broadcast.publishUrl,
      publishToken: broadcast.publishToken,
      expiresAt: broadcast.expiresAt,
      playbackUrl: broadcast.playbackUrl,
      fallbackRtmp: broadcast.fallbackRtmp,
    },
  }, 201);
});

app.patch('/v1/seller/sessions/:sessionId/stream', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');
  const body = await c.req.json<{ playbackUrl?: string }>().catch(() => ({} as { playbackUrl?: string }));

  const session = await prisma.showSession.findUnique({ where: { id: sessionId }, include: { show: true } });
  if (!session || session.show.sellerId !== user.id) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  }

  const playbackUrl = typeof body.playbackUrl === 'string' ? body.playbackUrl.trim() : '';
  if (!playbackUrl) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'playbackUrl is required' }, 400);
  }

  if (!/^https?:\/\//i.test(playbackUrl)) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'playbackUrl must start with http:// or https://' }, 400);
  }

  const updated = await prisma.showSession.update({
    where: { id: sessionId },
    data: { playbackUrl },
    include: { pinnedItem: { include: { inventoryItem: true } } },
  });

  return c.json(updated);
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

app.post('/v1/seller/sessions/:sessionId/passar-bastao', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');

  const session = await prisma.showSession.findUnique({ where: { id: sessionId }, include: { show: true } });
  if (!session || session.show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  if (session.status !== 'LIVE') return c.json({ statusCode: 409, error: 'Conflict', message: 'Only LIVE sessions can pass the baton' }, 409);

  // Find another live show from a different seller
  const otherLiveShows = await prisma.show.findMany({
    where: {
      status: 'LIVE',
      id: { not: session.showId },
      sellerId: { not: user.id },
    },
    select: { id: true, title: true },
  });

  if (otherLiveShows.length === 0) {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Não há outros shows ao vivo no momento para passar o bastão.' }, 409);
  }

  // Pick a random live show using a cryptographically secure RNG for fair selection
  const targetShow = otherLiveShows[randomInt(otherLiveShows.length)];

  if (session.providerSessionId) {
    try {
      const provider = createLiveVideoProvider(process.env.LIVE_VIDEO_PROVIDER ?? 'stub');
      await provider.endSession(session.providerSessionId);
    } catch {
      // continue with local state update even if provider call fails
    }
  }

  const updatedSession = await prisma.$transaction(async (tx) => {
    const endedSession = await tx.showSession.update({
      where: { id: sessionId },
      data: { status: 'ENDED', endedAt: new Date(), pinnedItemId: null, raidedToShowId: targetShow.id },
      include: { pinnedItem: { include: { inventoryItem: true } } },
    });
    await tx.show.update({ where: { id: session.showId }, data: { status: 'ENDED' } });
    return endedSession;
  });

  return c.json({ session: updatedSession, targetShowId: targetShow.id, targetShowTitle: targetShow.title });
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
  const updatedSession = await prisma.$transaction(async (tx) => {
    const endedSession = await tx.showSession.update({
      where: { id: sessionId },
      data: { status: 'ENDED', endedAt: new Date(), pinnedItemId: null },
      include: { pinnedItem: { include: { inventoryItem: true } } },
    });
    await tx.show.update({ where: { id: session.showId }, data: { status: 'ENDED' } });
    return endedSession;
  });
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
  if (session) return c.json(session);

  // If no active session, check for a recently ended session with a bastão pass so viewers can be redirected
  // Limit to sessions ended within the last 5 minutes to avoid returning stale redirect data
  if (show.status === 'ENDED') {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const endedSession = await prisma.showSession.findFirst({
      where: { showId, status: 'ENDED', raidedToShowId: { not: null }, endedAt: { gte: fiveMinutesAgo } },
      orderBy: { endedAt: 'desc' },
      select: { id: true, showId: true, status: true, raidedToShowId: true, endedAt: true },
    });
    if (endedSession) return c.json(endedSession);
  }

  return c.json({ statusCode: 404, error: 'Not Found', message: 'No active session' }, 404);
});

app.post('/v1/sessions/:sessionId/bids', authenticate, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');
  const body = await c.req.json<{ amount?: number }>().catch(() => ({} as { amount?: number }));

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'amount must be a positive number' }, 400);
  }

  const session = await prisma.showSession.findUnique({
    where: { id: sessionId },
    include: {
      show: { select: { sellerId: true } },
      pinnedItem: { include: { inventoryItem: true } },
    },
  });

  if (!session) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  }

  if (session.status !== 'LIVE') {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Bids are only accepted during a LIVE session' }, 409);
  }

  if (!session.pinnedItem || !session.pinnedItemId) {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'No item is currently pinned for bidding' }, 409);
  }

  if (session.show.sellerId === user.id) {
    return c.json({ statusCode: 403, error: 'Forbidden', message: 'Sellers cannot bid on their own live item' }, 403);
  }

  if (session.pinnedItem.soldOut) {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'This item is no longer available for bidding' }, 409);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const latestItem = await tx.showInventoryItem.findUnique({
        where: { id: session.pinnedItemId! },
        include: { inventoryItem: { select: { startingPrice: true } } },
      });

      if (!latestItem) {
        throw new Error('QUEUE_ITEM_NOT_FOUND');
      }

      if (latestItem.soldOut) {
        throw new Error('ITEM_SOLD_OUT');
      }

      const currentBid = asNumber(latestItem.currentBid);
      const startingPrice = asNumber(latestItem.inventoryItem.startingPrice) ?? 0;
      const minimumBid = (currentBid ?? startingPrice) + MIN_BID_INCREMENT;

      if (amount < minimumBid) {
        throw new Error(`BID_TOO_LOW:${minimumBid}`);
      }

      const updatedItem = await tx.showInventoryItem.update({
        where: { id: latestItem.id },
        data: {
          currentBid: amount,
          highestBidderId: user.id,
          bidCount: { increment: 1 },
        },
        include: {
          inventoryItem: true,
        },
      });

      const bid = await tx.liveBid.create({
        data: {
          sessionId,
          queueItemId: latestItem.id,
          bidderId: user.id,
          amount,
        },
      });

      return {
        bid,
        queueItem: updatedItem,
      };
    });

    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message === 'QUEUE_ITEM_NOT_FOUND') {
      return c.json({ statusCode: 404, error: 'Not Found', message: 'Pinned item not found' }, 404);
    }

    if (message === 'ITEM_SOLD_OUT') {
      return c.json({ statusCode: 409, error: 'Conflict', message: 'This item is no longer available for bidding' }, 409);
    }

    if (message.startsWith('BID_TOO_LOW:')) {
      const minimumBid = Number(message.split(':')[1]);
      return c.json({
        statusCode: 409,
        error: 'Conflict',
        message: `Bid too low. Minimum bid is R$ ${minimumBid.toFixed(2)}`,
        minimumBid,
      }, 409);
    }

    throw err;
  }
});

// ─── Broadcast lifecycle endpoints ───────────────────────────────────────────

app.post('/v1/seller/sessions/:sessionId/broadcast-started', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');
  const session = await prisma.showSession.findUnique({ where: { id: sessionId }, include: { show: true } });
  if (!session || session.show.sellerId !== user.id) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  }
  if (session.status !== 'LIVE' && session.status !== 'STARTING') {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Session is not active' }, 409);
  }

  if (session.providerSessionId && session.providerName) {
    try {
      const provider = createLiveVideoProvider(session.providerName);
      await provider.markBroadcastStarted?.(session.providerSessionId);
    } catch {
      // continue even if provider call fails
    }
  }

  const updated = await prisma.showSession.update({
    where: { id: sessionId },
    data: {
      status: 'LIVE',
      broadcastStartedAt: session.broadcastStartedAt ?? new Date(),
      broadcastHealth: 'GOOD',
    },
    include: { pinnedItem: { include: { inventoryItem: true } } },
  });
  return c.json(updated);
});

app.post('/v1/seller/sessions/:sessionId/broadcast-heartbeat', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');
  const body = await c.req.json<{ health?: string }>().catch(() => ({} as { health?: string }));
  const session = await prisma.showSession.findUnique({ where: { id: sessionId }, include: { show: true } });
  if (!session || session.show.sellerId !== user.id) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  }
  if (session.status !== 'LIVE') {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Session is not LIVE' }, 409);
  }

  const allowedHealth = ['GOOD', 'DEGRADED', 'DOWN'] as const;
  type BroadcastHealthValue = typeof allowedHealth[number];
  const health: BroadcastHealthValue = allowedHealth.includes(body.health as BroadcastHealthValue)
    ? (body.health as BroadcastHealthValue)
    : 'GOOD';

  const updated = await prisma.showSession.update({
    where: { id: sessionId },
    data: { broadcastLastHeartbeatAt: new Date(), broadcastHealth: health },
    include: { pinnedItem: { include: { inventoryItem: true } } },
  });
  return c.json(updated);
});

app.post('/v1/seller/sessions/:sessionId/broadcast-ended', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');
  const body = await c.req.json<{ reason?: string }>().catch(() => ({} as { reason?: string }));
  const session = await prisma.showSession.findUnique({ where: { id: sessionId }, include: { show: true } });
  if (!session || session.show.sellerId !== user.id) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  }
  if (session.status !== 'LIVE' && session.status !== 'STARTING') {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Session is not active' }, 409);
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : null;

  const updated = await prisma.$transaction(async (tx) => {
    const endedSession = await tx.showSession.update({
      where: { id: sessionId },
      data: { status: 'ENDED', endedAt: new Date(), pinnedItemId: null, broadcastEndedReason: reason },
      include: { pinnedItem: { include: { inventoryItem: true } } },
    });
    await tx.show.update({ where: { id: session.showId }, data: { status: 'ENDED' } });
    return endedSession;
  });
  return c.json(updated);
});

app.get('/v1/seller/sessions/:sessionId/broadcast-status', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');
  const session = await prisma.showSession.findUnique({
    where: { id: sessionId },
    include: { show: true, pinnedItem: { include: { inventoryItem: true } } },
  });
  if (!session || session.show.sellerId !== user.id) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  }
  return c.json({
    sessionId: session.id,
    status: session.status,
    ingestMode: session.ingestMode,
    broadcastHealth: session.broadcastHealth,
    broadcastStartedAt: session.broadcastStartedAt,
    firstFrameAt: session.firstFrameAt,
    broadcastLastHeartbeatAt: session.broadcastLastHeartbeatAt,
    reconnectCount: session.reconnectCount,
    broadcastErrorCode: session.broadcastErrorCode,
    broadcastEndedReason: session.broadcastEndedReason,
    publishUrl: session.publishUrl,
    playbackUrl: session.playbackUrl,
  });
});

app.get('/v1/sessions/:sessionId/bids', async (c) => {
  const sessionId = c.req.param('sessionId');
  const queueItemId = c.req.query('queueItemId');
  const take = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '20')));

  const session = await prisma.showSession.findUnique({ where: { id: sessionId }, select: { id: true } });
  if (!session) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  }

  const bids = await prisma.liveBid.findMany({
    where: {
      sessionId,
      ...(queueItemId ? { queueItemId } : {}),
    },
    include: {
      bidder: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take,
  });

  return c.json(bids.reverse());
});

export { app as liveSessionRoutes };
