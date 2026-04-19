import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { createLiveVideoProvider } from '@arremate/video';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';

const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')];

/**
 * Seller live-session control routes.
 *
 * POST   /v1/seller/shows/:showId/go-live            – start a live session
 * POST   /v1/seller/sessions/:sessionId/pin          – pin a queue item
 * DELETE /v1/seller/sessions/:sessionId/pin          – unpin the current item
 * PATCH  /v1/seller/shows/:showId/queue/:itemId/sold-out – mark a queue item sold out
 * POST   /v1/seller/sessions/:sessionId/end          – end the live session
 *
 * Public polling route:
 * GET    /v1/shows/:showId/session                   – get current session state
 */
export async function liveSessionRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Go live ─────────────────────────────────────────────────────────────────
  fastify.post(
    '/v1/seller/shows/:showId/go-live',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { showId } = request.params as { showId: string };

      const show = await prisma.show.findUnique({ where: { id: showId } });

      if (!show || show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
      }

      if (show.status !== 'SCHEDULED') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Only SCHEDULED shows can go live',
        });
      }

      // Check no active session already exists
      const activeSession = await prisma.showSession.findFirst({
        where: { showId, status: { in: ['STARTING', 'LIVE'] } },
      });

      if (activeSession) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'An active session already exists for this show',
        });
      }

      // Create provider session
      const provider = createLiveVideoProvider(process.env.LIVE_VIDEO_PROVIDER ?? 'stub');
      const providerResult = await provider.createSession(showId);

      // Persist session and transition show to LIVE atomically
      const [session] = await prisma.$transaction([
        prisma.showSession.create({
          data: {
            showId,
            status: 'LIVE',
            providerSessionId: providerResult.providerSessionId,
            playbackUrl: providerResult.playbackUrl ?? null,
            startedAt: new Date(),
          },
          include: {
            pinnedItem: {
              include: { inventoryItem: true },
            },
          },
        }),
        prisma.show.update({
          where: { id: showId },
          data: { status: 'LIVE' },
        }),
      ]);

      return reply.status(201).send(session);
    },
  );

  // ─── Pin item ─────────────────────────────────────────────────────────────────
  fastify.post(
    '/v1/seller/sessions/:sessionId/pin',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { sessionId } = request.params as { sessionId: string };
      const { queueItemId } = request.body as { queueItemId: string };

      if (!queueItemId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'queueItemId is required' });
      }

      const session = await prisma.showSession.findUnique({
        where: { id: sessionId },
        include: { show: true },
      });

      if (!session || session.show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });
      }

      if (session.status !== 'LIVE') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Can only pin items in a LIVE session',
        });
      }

      // Verify the queue item belongs to this show
      const queueItem = await prisma.showInventoryItem.findUnique({ where: { id: queueItemId } });

      if (!queueItem || queueItem.showId !== session.showId) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Queue item not found' });
      }

      const updated = await prisma.showSession.update({
        where: { id: sessionId },
        data: { pinnedItemId: queueItemId },
        include: {
          pinnedItem: {
            include: { inventoryItem: true },
          },
        },
      });

      return reply.send(updated);
    },
  );

  // ─── Unpin item ───────────────────────────────────────────────────────────────
  fastify.delete(
    '/v1/seller/sessions/:sessionId/pin',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { sessionId } = request.params as { sessionId: string };

      const session = await prisma.showSession.findUnique({
        where: { id: sessionId },
        include: { show: true },
      });

      if (!session || session.show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });
      }

      if (session.status !== 'LIVE') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Can only unpin items in a LIVE session',
        });
      }

      const updated = await prisma.showSession.update({
        where: { id: sessionId },
        data: { pinnedItemId: null },
        include: {
          pinnedItem: {
            include: { inventoryItem: true },
          },
        },
      });

      return reply.send(updated);
    },
  );

  // ─── Mark queue item sold out ─────────────────────────────────────────────────
  fastify.patch(
    '/v1/seller/shows/:showId/queue/:itemId/sold-out',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { showId, itemId } = request.params as { showId: string; itemId: string };
      const { soldOut } = request.body as { soldOut?: boolean };

      const show = await prisma.show.findUnique({ where: { id: showId } });

      if (!show || show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
      }

      if (show.status !== 'LIVE') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Can only update availability during a LIVE show',
        });
      }

      const queueItem = await prisma.showInventoryItem.findUnique({ where: { id: itemId } });

      if (!queueItem || queueItem.showId !== showId) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Queue item not found' });
      }

      const updated = await prisma.showInventoryItem.update({
        where: { id: itemId },
        data: { soldOut: soldOut ?? true },
        include: { inventoryItem: true },
      });

      return reply.send(updated);
    },
  );

  // ─── End session ──────────────────────────────────────────────────────────────
  fastify.post(
    '/v1/seller/sessions/:sessionId/end',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { sessionId } = request.params as { sessionId: string };

      const session = await prisma.showSession.findUnique({
        where: { id: sessionId },
        include: { show: true },
      });

      if (!session || session.show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });
      }

      if (session.status !== 'LIVE') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Only LIVE sessions can be ended',
        });
      }

      // Notify provider
      if (session.providerSessionId) {
        try {
          const provider = createLiveVideoProvider(process.env.LIVE_VIDEO_PROVIDER ?? 'stub');
          await provider.endSession(session.providerSessionId);
        } catch (err) {
          request.log.warn({ err }, 'Provider endSession failed; continuing with local state update');
        }
      }

      const [updatedSession] = await prisma.$transaction([
        prisma.showSession.update({
          where: { id: sessionId },
          data: { status: 'ENDED', endedAt: new Date(), pinnedItemId: null },
          include: {
            pinnedItem: {
              include: { inventoryItem: true },
            },
          },
        }),
        prisma.show.update({
          where: { id: session.showId },
          data: { status: 'ENDED' },
        }),
      ]);

      return reply.send(updatedSession);
    },
  );

  // ─── Public: get current session state (polling endpoint) ────────────────────
  fastify.get('/v1/shows/:showId/session', async (request, reply) => {
    const { showId } = request.params as { showId: string };

    // Only expose sessions for publicly visible shows
    const show = await prisma.show.findUnique({
      where: { id: showId },
      select: { id: true, status: true },
    });

    if (!show || (show.status !== 'SCHEDULED' && show.status !== 'LIVE' && show.status !== 'ENDED')) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
    }

    const session = await prisma.showSession.findFirst({
      where: { showId, status: { in: ['LIVE', 'STARTING'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        pinnedItem: {
          include: {
            inventoryItem: {
              include: { images: { orderBy: { position: 'asc' } } },
            },
          },
        },
      },
    });

    if (!session) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'No active session' });
    }

    return reply.send(session);
  });
}
