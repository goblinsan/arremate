import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

app.get('/v1/admin/seller-applications', ...adminGuard, async (c) => {
  const status = c.req.query('status');
  const pageNum = Math.max(1, Number(c.req.query('page') ?? '1'));
  const take = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '20')));
  const skip = (pageNum - 1) * take;
  const where = status ? { status: status as 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' } : {};
  const [items, total] = await Promise.all([
    prisma.sellerApplication.findMany({
      where,
      include: { user: { select: { id: true, email: true, name: true } }, documents: { select: { id: true, documentType: true, fileName: true, uploadedAt: true } } },
      orderBy: { createdAt: 'desc' }, skip, take,
    }),
    prisma.sellerApplication.count({ where }),
  ]);
  return c.json({ data: items, meta: { total, page: pageNum, perPage: take } });
});

app.get('/v1/admin/seller-applications/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const application = await prisma.sellerApplication.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true } }, documents: true },
  });
  if (!application) return c.json({ statusCode: 404, error: 'Not Found', message: 'Seller application not found' }, 404);
  return c.json(application);
});

app.post('/v1/admin/seller-applications/:id/approve', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');
  const application = await prisma.sellerApplication.findUnique({ where: { id } });
  if (!application) return c.json({ statusCode: 404, error: 'Not Found', message: 'Seller application not found' }, 404);
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(application.status)) {
    return c.json({ statusCode: 409, error: 'Conflict', message: `Cannot approve application with status: ${application.status}` }, 409);
  }
  const updatedApplication = await prisma.$transaction(async (tx) => {
    const approvedApplication = await tx.sellerApplication.update({ where: { id }, data: { status: 'APPROVED', reviewedById: admin.id, reviewedAt: new Date() } });
    await tx.sellerAccount.upsert({ where: { userId: application.userId }, update: { isActive: true, applicationId: id }, create: { userId: application.userId, applicationId: id, isActive: true } });
    await tx.user.update({ where: { id: application.userId }, data: { role: 'SELLER' } });
    return approvedApplication;
  });
  await createAuditEvent({ action: 'SELLER_APPLICATION_APPROVED', actorId: admin.id, applicationId: id, metadata: { applicationUserId: application.userId } });
  return c.json(updatedApplication);
});

app.post('/v1/admin/seller-applications/:id/reject', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');
  const body = await c.req.json<{ notes?: string }>().catch(() => ({ notes: undefined }));
  const notes = body?.notes;
  const application = await prisma.sellerApplication.findUnique({ where: { id } });
  if (!application) return c.json({ statusCode: 404, error: 'Not Found', message: 'Seller application not found' }, 404);
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(application.status)) {
    return c.json({ statusCode: 409, error: 'Conflict', message: `Cannot reject application with status: ${application.status}` }, 409);
  }
  const updated = await prisma.sellerApplication.update({ where: { id }, data: { status: 'REJECTED', reviewedById: admin.id, reviewNotes: notes ?? null, reviewedAt: new Date() } });
  await createAuditEvent({ action: 'SELLER_APPLICATION_REJECTED', actorId: admin.id, applicationId: id, metadata: { notes: notes ?? null, applicationUserId: application.userId } });
  return c.json(updated);
});

export { app as adminSellerApplicationRoutes };
