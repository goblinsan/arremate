import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { generateUploadUrl } from '../services/s3-upload.js';
import { randomUUID } from 'crypto';

const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')];

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Seller-facing inventory management routes.
 *
 * GET    /v1/seller/inventory                         – list inventory items
 * POST   /v1/seller/inventory                         – create an item
 * GET    /v1/seller/inventory/:id                     – get item with images
 * PATCH  /v1/seller/inventory/:id                     – edit item
 * DELETE /v1/seller/inventory/:id                     – delete item
 * POST   /v1/seller/inventory/:id/images/upload-url   – request signed S3 URL
 * POST   /v1/seller/inventory/:id/images              – register uploaded image
 */
export async function sellerInventoryRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── List inventory ─────────────────────────────────────────────────────────
  fastify.get(
    '/v1/seller/inventory',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { page = '1', perPage = '20' } = request.query as Record<string, string>;
      const pageNum = Math.max(1, Number(page));
      const take = Math.min(100, Math.max(1, Number(perPage)));
      const skip = (pageNum - 1) * take;

      const [items, total] = await Promise.all([
        prisma.inventoryItem.findMany({
          where: { sellerId: user.id },
          include: { images: { orderBy: { position: 'asc' }, take: 1 } },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.inventoryItem.count({ where: { sellerId: user.id } }),
      ]);

      return reply.send({ data: items, meta: { total, page: pageNum, perPage: take } });
    },
  );

  // ─── Create inventory item ──────────────────────────────────────────────────
  fastify.post(
    '/v1/seller/inventory',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { title, description, condition, startingPrice } = request.body as {
        title: string;
        description?: string;
        condition?: string;
        startingPrice: number;
      };

      if (!title || title.trim() === '') {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'title is required' });
      }
      if (startingPrice === undefined || isNaN(Number(startingPrice)) || Number(startingPrice) < 0) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'startingPrice must be a non-negative number' });
      }

      const validConditions = ['NEW', 'USED', 'REFURBISHED'];
      const itemCondition = condition && validConditions.includes(condition) ? condition : 'NEW';

      const item = await prisma.inventoryItem.create({
        data: {
          sellerId: user.id,
          title: title.trim(),
          description: description?.trim() ?? null,
          condition: itemCondition as 'NEW' | 'USED' | 'REFURBISHED',
          startingPrice: Number(startingPrice),
        },
        include: { images: true },
      });

      return reply.status(201).send(item);
    },
  );

  // ─── Get single item ────────────────────────────────────────────────────────
  fastify.get(
    '/v1/seller/inventory/:id',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };

      const item = await prisma.inventoryItem.findUnique({
        where: { id },
        include: { images: { orderBy: { position: 'asc' } } },
      });

      if (!item || item.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Item not found' });
      }

      return reply.send(item);
    },
  );

  // ─── Update inventory item ──────────────────────────────────────────────────
  fastify.patch(
    '/v1/seller/inventory/:id',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };
      const { title, description, condition, startingPrice } = request.body as {
        title?: string;
        description?: string;
        condition?: string;
        startingPrice?: number;
      };

      const item = await prisma.inventoryItem.findUnique({ where: { id } });

      if (!item || item.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Item not found' });
      }

      const validConditions = ['NEW', 'USED', 'REFURBISHED'];

      const updated = await prisma.inventoryItem.update({
        where: { id },
        data: {
          ...(title !== undefined && { title: title.trim() }),
          ...(description !== undefined && { description: description?.trim() ?? null }),
          ...(condition !== undefined && validConditions.includes(condition) && {
            condition: condition as 'NEW' | 'USED' | 'REFURBISHED',
          }),
          ...(startingPrice !== undefined && { startingPrice: Number(startingPrice) }),
        },
        include: { images: { orderBy: { position: 'asc' } } },
      });

      return reply.send(updated);
    },
  );

  // ─── Delete inventory item ──────────────────────────────────────────────────
  fastify.delete(
    '/v1/seller/inventory/:id',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };

      const item = await prisma.inventoryItem.findUnique({ where: { id } });

      if (!item || item.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Item not found' });
      }

      await prisma.inventoryItem.delete({ where: { id } });

      return reply.status(204).send();
    },
  );

  // ─── Request signed upload URL for image ───────────────────────────────────
  fastify.post(
    '/v1/seller/inventory/:id/images/upload-url',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };
      const { fileName, contentType } = request.body as {
        fileName: string;
        contentType: string;
      };

      const item = await prisma.inventoryItem.findUnique({ where: { id } });

      if (!item || item.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Item not found' });
      }

      if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `contentType must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
        });
      }

      if (!fileName || fileName.trim() === '') {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'fileName is required' });
      }

      const s3Key = `inventory/${user.id}/${id}/${randomUUID()}-${fileName.trim()}`;
      const result = await generateUploadUrl(s3Key, contentType);

      return reply.send(result);
    },
  );

  // ─── Register uploaded image ────────────────────────────────────────────────
  fastify.post(
    '/v1/seller/inventory/:id/images',
    { preHandler: sellerGuard },
    async (request, reply) => {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };
      const { s3Key, contentType, fileName, position } = request.body as {
        s3Key: string;
        contentType: string;
        fileName: string;
        position?: number;
      };

      const item = await prisma.inventoryItem.findUnique({ where: { id } });

      if (!item || item.sellerId !== user.id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Item not found' });
      }

      if (!s3Key || !contentType || !fileName) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 's3Key, contentType, and fileName are required',
        });
      }

      // Auto-assign position if not provided
      let imagePosition = position ?? 0;
      if (position === undefined) {
        const maxImage = await prisma.inventoryImage.findFirst({
          where: { itemId: id },
          orderBy: { position: 'desc' },
        });
        imagePosition = maxImage ? maxImage.position + 1 : 0;
      }

      const image = await prisma.inventoryImage.create({
        data: {
          itemId: id,
          s3Key,
          contentType,
          fileName,
          position: imagePosition,
        },
      });

      return reply.status(201).send(image);
    },
  );
}
