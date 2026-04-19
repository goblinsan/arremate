import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';

const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')];

/**
 * Show queue routes – attaching and ordering inventory items within a show.
 *
 * GET    /v1/seller/shows/:showId/queue              – get the queue
 * POST   /v1/seller/shows/:showId/queue              – add an item to the queue
 * DELETE /v1/seller/shows/:showId/queue/:itemId      – remove an item from the queue
 * PATCH  /v1/seller/shows/:showId/queue/reorder      – reorder all items
 */
export async function showQueueRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Get queue ──────────────────────────────────────────────────────────────
  fastify.get(
    '/v1/seller/shows/:showId/queue',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { showId } = request.params as { showId: string };

      const show = await prisma.show.findUnique({ where: { id: showId } });

      if (!show || show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
      }

      const queueItems = await prisma.showInventoryItem.findMany({
        where: { showId },
        orderBy: { position: 'asc' },
        include: {
          inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } },
        },
      });

      return reply.send(queueItems);
    },
  );

  // ─── Add item to queue ──────────────────────────────────────────────────────
  fastify.post(
    '/v1/seller/shows/:showId/queue',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { showId } = request.params as { showId: string };
      const { inventoryItemId, position } = request.body as {
        inventoryItemId: string;
        position?: number;
      };

      if (!inventoryItemId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'inventoryItemId is required' });
      }

      const [show, inventoryItem] = await Promise.all([
        prisma.show.findUnique({ where: { id: showId } }),
        prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } }),
      ]);

      if (!show || show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
      }

      if (!inventoryItem || inventoryItem.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Inventory item not found' });
      }
      let queuePosition = position ?? 0;
      if (position === undefined) {
        const lastItem = await prisma.showInventoryItem.findFirst({
          where: { showId },
          orderBy: { position: 'desc' },
        });
        queuePosition = lastItem ? lastItem.position + 1 : 0;
      }

      try {
        const entry = await prisma.showInventoryItem.create({
          data: {
            showId,
            inventoryItemId,
            position: queuePosition,
          },
          include: {
            inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } },
          },
        });
        return reply.status(201).send(entry);
      } catch (err: unknown) {
        // Unique constraint violation – item already in queue
        const error = err as { code?: string };
        if (error?.code === 'P2002') {
          return reply.status(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'This item is already in the queue',
          });
        }
        throw err;
      }
    },
  );

  // ─── Remove item from queue ─────────────────────────────────────────────────
  fastify.delete(
    '/v1/seller/shows/:showId/queue/:itemId',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { showId, itemId } = request.params as { showId: string; itemId: string };

      const show = await prisma.show.findUnique({ where: { id: showId } });

      if (!show || show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
      }

      const entry = await prisma.showInventoryItem.findUnique({ where: { id: itemId } });

      if (!entry || entry.showId !== showId) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Queue entry not found' });
      }

      await prisma.showInventoryItem.delete({ where: { id: itemId } });

      return reply.status(204).send();
    },
  );

  // ─── Reorder queue ──────────────────────────────────────────────────────────
  fastify.patch(
    '/v1/seller/shows/:showId/queue/reorder',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { showId } = request.params as { showId: string };
      const { order } = request.body as { order: string[] };

      if (!Array.isArray(order)) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'order must be an array of queue entry IDs' });
      }

      const show = await prisma.show.findUnique({ where: { id: showId } });

      if (!show || show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
      }

      // Update positions in a transaction
      await prisma.$transaction(
        order.map((entryId, index) =>
          prisma.showInventoryItem.updateMany({
            where: { id: entryId, showId },
            data: { position: index },
          }),
        ),
      );

      const updated = await prisma.showInventoryItem.findMany({
        where: { showId },
        orderBy: { position: 'asc' },
        include: {
          inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } },
        },
      });

      return reply.send(updated);
    },
  );
}
