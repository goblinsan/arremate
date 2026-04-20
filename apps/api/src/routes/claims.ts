import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';

/**
 * Claim routes for live session item purchases.
 *
 * POST /v1/sessions/:sessionId/claim  – claim the currently pinned item (authenticated buyer)
 * GET  /v1/claims/:claimId            – get claim status (authenticated buyer)
 */

const CLAIM_EXPIRY_MINUTES = 15;

/**
 * Lazily expire a PENDING claim if its expiresAt has passed.
 * Returns the effective claim status.
 */
async function expireIfOverdue(claimId: string, expiresAt: Date, currentStatus: string) {
  if (currentStatus !== 'PENDING') return currentStatus;
  if (expiresAt > new Date()) return currentStatus;

  await prisma.claim.update({
    where: { id: claimId },
    data: { status: 'EXPIRED' },
  });
  return 'EXPIRED';
}

export async function claimRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Create claim (authenticated buyer) ──────────────────────────────────────
  fastify.post(
    '/v1/sessions/:sessionId/claim',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;
      const { sessionId } = request.params as { sessionId: string };

      // Load session with pinned item
      const session = await prisma.showSession.findUnique({
        where: { id: sessionId },
        include: {
          pinnedItem: {
            include: {
              inventoryItem: true,
            },
          },
        },
      });

      if (!session) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });
      }

      if (session.status !== 'LIVE') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Claims are only accepted during a LIVE session',
        });
      }

      if (!session.pinnedItem || !session.pinnedItemId) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'No item is currently available for claim',
        });
      }

      if (session.pinnedItem.soldOut) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'This item is no longer available',
        });
      }

      // Prevent buyer from claiming the same item twice in this session
      const existingClaim = await prisma.claim.findFirst({
        where: {
          sessionId,
          buyerId: user.id,
          queueItemId: session.pinnedItemId,
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      });

      if (existingClaim) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'You already have an active claim for this item',
        });
      }

      const priceAtClaim = session.pinnedItem.inventoryItem.startingPrice;
      const expiresAt = new Date(Date.now() + CLAIM_EXPIRY_MINUTES * 60 * 1000);

      // Create claim and mark item as sold out atomically
      const [claim] = await prisma.$transaction([
        prisma.claim.create({
          data: {
            sessionId,
            buyerId: user.id,
            queueItemId: session.pinnedItemId,
            priceAtClaim,
            expiresAt,
          },
          include: {
            queueItem: {
              include: { inventoryItem: true },
            },
          },
        }),
        prisma.showInventoryItem.update({
          where: { id: session.pinnedItemId },
          data: { soldOut: true },
        }),
      ]);

      return reply.status(201).send(claim);
    },
  );

  // ─── Get claim status (authenticated buyer) ───────────────────────────────────
  fastify.get(
    '/v1/claims/:claimId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;
      const { claimId } = request.params as { claimId: string };

      const claim = await prisma.claim.findUnique({
        where: { id: claimId },
        include: {
          queueItem: {
            include: { inventoryItem: true },
          },
        },
      });

      if (!claim || claim.buyerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Claim not found' });
      }

      // Lazily expire if overdue
      const currentStatus = await expireIfOverdue(claim.id, claim.expiresAt, claim.status);

      return reply.send({ ...claim, status: currentStatus });
    },
  );
}
