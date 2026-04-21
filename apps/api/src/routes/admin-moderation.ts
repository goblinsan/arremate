import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

app.post('/v1/admin/users/:id/strikes', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');
  const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({} as { reason?: string }));
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return c.json({ statusCode: 404, error: 'Not Found', message: 'User not found' }, 404);
  if (user.role !== 'SELLER') return c.json({ statusCode: 422, error: 'Unprocessable Entity', message: 'Strikes can only be issued to sellers' }, 422);
  const moderationCase = await prisma.moderationCase.create({
    data: { userId: id, actionType: 'SELLER_STRIKE', reason: reason ?? null, actorId: admin.id },
    include: { user: { select: { id: true, name: true, email: true } }, actor: { select: { id: true, name: true, email: true } } },
  });
  await createAuditEvent({ action: 'SELLER_STRIKE_ISSUED', actorId: admin.id, metadata: { targetUserId: id, reason: reason ?? null, moderationCaseId: moderationCase.id } });
  return c.json(moderationCase, 201);
});

app.post('/v1/admin/users/:id/suspend', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');
  const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({} as { reason?: string }));
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return c.json({ statusCode: 404, error: 'Not Found', message: 'User not found' }, 404);
  if (user.isSuspended) return c.json({ statusCode: 409, error: 'Conflict', message: 'User is already suspended' }, 409);
  const [updatedUser, moderationCase] = await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { isSuspended: true, suspendedAt: new Date() } }),
    prisma.moderationCase.create({ data: { userId: id, actionType: 'USER_SUSPENSION', reason: reason ?? null, actorId: admin.id } }),
  ]);
  await createAuditEvent({ action: 'USER_SUSPENDED', actorId: admin.id, metadata: { targetUserId: id, reason: reason ?? null, moderationCaseId: moderationCase.id } });
  return c.json({ user: updatedUser, moderationCase });
});

app.post('/v1/admin/users/:id/unsuspend', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');
  const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({} as { reason?: string }));
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return c.json({ statusCode: 404, error: 'Not Found', message: 'User not found' }, 404);
  if (!user.isSuspended) return c.json({ statusCode: 409, error: 'Conflict', message: 'User is not currently suspended' }, 409);
  const [updatedUser, moderationCase] = await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { isSuspended: false, suspendedAt: null } }),
    prisma.moderationCase.create({ data: { userId: id, actionType: 'USER_UNSUSPENSION', reason: reason ?? null, actorId: admin.id } }),
  ]);
  await createAuditEvent({ action: 'USER_UNSUSPENDED', actorId: admin.id, metadata: { targetUserId: id, reason: reason ?? null, moderationCaseId: moderationCase.id } });
  return c.json({ user: updatedUser, moderationCase });
});

app.get('/v1/admin/users/:id/moderation-history', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return c.json({ statusCode: 404, error: 'Not Found', message: 'User not found' }, 404);
  const cases = await prisma.moderationCase.findMany({
    where: { userId: id },
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ user, cases });
});

export { app as adminModerationRoutes };
