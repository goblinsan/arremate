import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

// ─── Admin Orders (Fee Reconciliation) ───────────────────────────────────────

app.get('/v1/admin/orders', ...adminGuard, async (c) => {
  const pageNum = Math.max(1, Number(c.req.query('page') ?? '1'));
  const take = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '30')));
  const skip = (pageNum - 1) * take;

  const statusParam = c.req.query('status');
  const overrideOnly = c.req.query('sellerOverrideOnly') === 'true';

  const where: {
    status?: 'PAID' | 'PENDING_PAYMENT' | 'CANCELLED' | 'REFUNDED';
    sellerOverrideApplied?: boolean;
  } = {};
  if (
    statusParam === 'PAID' ||
    statusParam === 'PENDING_PAYMENT' ||
    statusParam === 'CANCELLED' ||
    statusParam === 'REFUNDED'
  ) {
    where.status = statusParam;
  }
  if (overrideOnly) {
    where.sellerOverrideApplied = true;
  }

  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        lines: { take: 1, orderBy: { createdAt: 'asc' } },
        refunds: true,
      },
    }),
  ]);

  return c.json({ data: orders, total, page: pageNum, perPage: take });
});

export { app as adminOrderRoutes };
