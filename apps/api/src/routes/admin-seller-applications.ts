import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';

/**
 * Admin routes for seller application review.
 *
 * GET  /v1/admin/seller-applications          – list applications (with optional status filter)
 * GET  /v1/admin/seller-applications/:id      – get single application with documents
 * POST /v1/admin/seller-applications/:id/approve – approve and create seller account
 * POST /v1/admin/seller-applications/:id/reject  – reject with notes
 */
export async function adminSellerApplicationRoutes(fastify: FastifyInstance): Promise<void> {
  const adminGuard = [authenticate, requireRole('ADMIN')];

  // ─── List applications ──────────────────────────────────────────────────────
  fastify.get('/v1/admin/seller-applications', { preHandler: adminGuard }, async (request, reply) => {
    const { status, page = '1', perPage = '20' } = request.query as Record<string, string>;

    const pageNum = Math.max(1, Number(page));
    const take = Math.min(100, Math.max(1, Number(perPage)));
    const skip = (pageNum - 1) * take;

    const where = status ? { status: status as 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' } : {};

    const [items, total] = await Promise.all([
      prisma.sellerApplication.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          documents: { select: { id: true, documentType: true, fileName: true, uploadedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.sellerApplication.count({ where }),
    ]);

    return reply.send({
      data: items,
      meta: { total, page: pageNum, perPage: take },
    });
  });

  // ─── Get single application ─────────────────────────────────────────────────
  fastify.get('/v1/admin/seller-applications/:id', { preHandler: adminGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const application = await prisma.sellerApplication.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        documents: true,
      },
    });

    if (!application) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Seller application not found',
      });
    }

    return reply.send(application);
  });

  // ─── Approve application ────────────────────────────────────────────────────
  fastify.post('/v1/admin/seller-applications/:id/approve', { preHandler: adminGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const admin = request.currentUser!;

    const application = await prisma.sellerApplication.findUnique({ where: { id } });

    if (!application) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Seller application not found',
      });
    }

    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(application.status)) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: `Cannot approve application with status: ${application.status}`,
      });
    }

    // Run approval in a transaction: update application, create seller account,
    // promote user role.
    const [updatedApplication] = await prisma.$transaction([
      prisma.sellerApplication.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      }),
      prisma.sellerAccount.upsert({
        where: { userId: application.userId },
        update: { isActive: true, applicationId: id },
        create: {
          userId: application.userId,
          applicationId: id,
          isActive: true,
        },
      }),
      prisma.user.update({
        where: { id: application.userId },
        data: { role: 'SELLER' },
      }),
    ]);

    await createAuditEvent({
      action: 'SELLER_APPLICATION_APPROVED',
      actorId: admin.id,
      applicationId: id,
      metadata: { applicationUserId: application.userId },
    });

    return reply.send(updatedApplication);
  });

  // ─── Reject application ─────────────────────────────────────────────────────
  fastify.post('/v1/admin/seller-applications/:id/reject', { preHandler: adminGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const admin = request.currentUser!;

    const { notes } = (request.body ?? {}) as { notes?: string };

    const application = await prisma.sellerApplication.findUnique({ where: { id } });

    if (!application) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Seller application not found',
      });
    }

    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(application.status)) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: `Cannot reject application with status: ${application.status}`,
      });
    }

    const updated = await prisma.sellerApplication.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: admin.id,
        reviewNotes: notes ?? null,
        reviewedAt: new Date(),
      },
    });

    await createAuditEvent({
      action: 'SELLER_APPLICATION_REJECTED',
      actorId: admin.id,
      applicationId: id,
      metadata: { notes: notes ?? null, applicationUserId: application.userId },
    });

    return reply.send(updated);
  });
}
