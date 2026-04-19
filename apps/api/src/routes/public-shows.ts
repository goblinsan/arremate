import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';

/**
 * Public show endpoints (no authentication required).
 *
 * GET /v1/shows           – list upcoming / scheduled shows
 * GET /v1/shows/:id       – public show detail with queue
 */
export async function publicShowRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Upcoming shows ─────────────────────────────────────────────────────────
  fastify.get('/v1/shows', async (request, reply) => {
    const { page = '1', perPage = '20' } = request.query as Record<string, string>;
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

    return reply.send({ data: items, meta: { total, page: pageNum, perPage: take } });
  });

  // ─── Show detail ─────────────────────────────────────────────────────────────
  fastify.get('/v1/shows/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

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
          where: {},
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

    if (!show) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
    }

    // Only expose shows that are scheduled or live to the public
    if (show.status !== 'SCHEDULED' && show.status !== 'LIVE') {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Show not found' });
    }

    return reply.send(show);
  });
}
