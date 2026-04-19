import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';

const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')];

/**
 * Seller-facing show management routes.
 *
 * GET    /v1/seller/shows            – list the seller's shows
 * POST   /v1/seller/shows            – create a show
 * GET    /v1/seller/shows/:id        – get a single show with queue
 * PATCH  /v1/seller/shows/:id        – edit title/description/scheduledAt
 * POST   /v1/seller/shows/:id/schedule – move to SCHEDULED status
 * POST   /v1/seller/shows/:id/cancel   – cancel the show
 */
export async function sellerShowRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── List shows ─────────────────────────────────────────────────────────────
  fastify.get(
    '/v1/seller/shows',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { page = '1', perPage = '20' } = request.query as Record<string, string>;
      const pageNum = Math.max(1, Number(page));
      const take = Math.min(100, Math.max(1, Number(perPage)));
      const skip = (pageNum - 1) * take;

      const [items, total] = await Promise.all([
        prisma.show.findMany({
          where: { sellerId: user.id },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.show.count({ where: { sellerId: user.id } }),
      ]);

      return reply.send({ data: items, meta: { total, page: pageNum, perPage: take } });
    },
  );

  // ─── Create show ────────────────────────────────────────────────────────────
  fastify.post(
    '/v1/seller/shows',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { title, description, scheduledAt } = request.body as {
        title: string;
        description?: string;
        scheduledAt?: string;
      };

      if (!title || title.trim() === '') {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'title is required' });
      }

      const show = await prisma.show.create({
        data: {
          sellerId: user.id,
          title: title.trim(),
          description: description?.trim() ?? null,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        },
      });

      return reply.status(201).send(show);
    },
  );

  // ─── Get single show ────────────────────────────────────────────────────────
  fastify.get(
    '/v1/seller/shows/:id',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };

      const show = await prisma.show.findUnique({
        where: { id },
        include: {
          queueItems: {
            orderBy: { position: 'asc' },
            include: {
              inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } },
            },
          },
        },
      });

      if (!show || show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
      }

      return reply.send(show);
    },
  );

  // ─── Update show ────────────────────────────────────────────────────────────
  fastify.patch(
    '/v1/seller/shows/:id',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };
      const { title, description, scheduledAt } = request.body as {
        title?: string;
        description?: string;
        scheduledAt?: string | null;
      };

      const show = await prisma.show.findUnique({ where: { id } });

      if (!show || show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
      }

      if (show.status === 'CANCELLED' || show.status === 'ENDED') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Cannot edit a cancelled or ended show',
        });
      }

      const updated = await prisma.show.update({
        where: { id },
        data: {
          ...(title !== undefined && { title: title.trim() }),
          ...(description !== undefined && { description: description?.trim() ?? null }),
          ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
        },
      });

      return reply.send(updated);
    },
  );

  // ─── Schedule show ──────────────────────────────────────────────────────────
  fastify.post(
    '/v1/seller/shows/:id/schedule',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };

      const show = await prisma.show.findUnique({ where: { id } });

      if (!show || show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
      }

      if (show.status !== 'DRAFT') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Only DRAFT shows can be scheduled',
        });
      }

      if (!show.scheduledAt) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'scheduledAt must be set before scheduling',
        });
      }

      const updated = await prisma.show.update({
        where: { id },
        data: { status: 'SCHEDULED' },
      });

      return reply.send(updated);
    },
  );

  // ─── Cancel show ─────────────────────────────────────────────────────────────
  fastify.post(
    '/v1/seller/shows/:id/cancel',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };

      const show = await prisma.show.findUnique({ where: { id } });

      if (!show || show.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
      }

      if (show.status === 'ENDED' || show.status === 'CANCELLED') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Show is already ended or cancelled',
        });
      }

      const updated = await prisma.show.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      return reply.send(updated);
    },
  );
}
