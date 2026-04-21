import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

app.get('/v1/admin/audit-events', ...adminGuard, async (c) => {
  const action = c.req.query('action');
  const actorId = c.req.query('actorId');
  const pageNum = Math.max(1, Number(c.req.query('page') ?? '1'));
  const take = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '20')));
  const skip = (pageNum - 1) * take;
  const where: Record<string, unknown> = {};
  if (action) where.action = { contains: action, mode: 'insensitive' };
  if (actorId) where.actorId = actorId;
  const [items, total] = await Promise.all([
    prisma.auditEvent.findMany({ where, include: { actor: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.auditEvent.count({ where }),
  ]);
  return c.json({ data: items, meta: { total, page: pageNum, perPage: take } });
});

export { app as adminAuditRoutes };
