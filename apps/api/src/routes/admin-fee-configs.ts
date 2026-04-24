import { Hono } from 'hono';
import { prisma, Prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

// ─── Fee Configs ──────────────────────────────────────────────────────────────

app.get('/v1/admin/fee-configs', ...adminGuard, async (c) => {
  const configs = await prisma.feeConfig.findMany({
    orderBy: [{ version: 'desc' }],
    include: {
      sellerOverrides: { include: { seller: { select: { id: true, name: true, email: true } } } },
      promotions: true,
    },
  });
  return c.json({ data: configs });
});

app.get('/v1/admin/fee-configs/active', ...adminGuard, async (c) => {
  const now = new Date();
  const config = await prisma.feeConfig.findFirst({
    where: {
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    include: {
      sellerOverrides: { include: { seller: { select: { id: true, name: true, email: true } } } },
      promotions: true,
    },
  });
  if (!config) return c.json({ statusCode: 404, error: 'Not Found', message: 'No active fee configuration' }, 404);
  return c.json(config);
});

app.get('/v1/admin/fee-configs/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const config = await prisma.feeConfig.findUnique({
    where: { id },
    include: {
      sellerOverrides: { include: { seller: { select: { id: true, name: true, email: true } } } },
      promotions: true,
    },
  });
  if (!config) return c.json({ statusCode: 404, error: 'Not Found', message: 'Fee config not found' }, 404);
  return c.json(config);
});

app.post('/v1/admin/fee-configs', ...adminGuard, async (c) => {
  const admin = c.get('currentUser');
  const body = await c.req.json<{
    version?: number;
    label?: string;
    commissionBps: number;
    processorFeeBps?: number;
    shippingModel?: 'INCLUDED' | 'PASS_THROUGH' | 'FIXED';
    shippingFixedCents?: number;
    metadata?: Record<string, unknown>;
    effectiveFrom: string;
    effectiveTo?: string;
  }>().catch(() => null);

  if (!body) return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body' }, 400);
  if (typeof body.commissionBps !== 'number' || body.commissionBps < 0 || body.commissionBps > 10_000) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'commissionBps must be a number between 0 and 10000' }, 400);
  }
  if (!body.effectiveFrom) return c.json({ statusCode: 400, error: 'Bad Request', message: 'effectiveFrom is required' }, 400);

  const lastConfig = await prisma.feeConfig.findFirst({ orderBy: { version: 'desc' } });
  const nextVersion = body.version ?? (lastConfig ? lastConfig.version + 1 : 1);

  const config = await prisma.feeConfig.create({
    data: {
      version: nextVersion,
      label: body.label ?? null,
      commissionBps: body.commissionBps,
      processorFeeBps: body.processorFeeBps ?? 0,
      shippingModel: body.shippingModel ?? 'INCLUDED',
      shippingFixedCents: body.shippingFixedCents ?? 0,
      metadata: (body.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      isActive: false,
      effectiveFrom: new Date(body.effectiveFrom),
      effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
    },
  });

  await createAuditEvent({ action: 'FEE_CONFIG_CREATED', actorId: admin.id, metadata: { configId: config.id, version: config.version } });
  return c.json(config, 201);
});

app.post('/v1/admin/fee-configs/:id/activate', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');

  const config = await prisma.feeConfig.findUnique({ where: { id } });
  if (!config) return c.json({ statusCode: 404, error: 'Not Found', message: 'Fee config not found' }, 404);
  if (config.isActive) return c.json({ statusCode: 409, error: 'Conflict', message: 'Fee config is already active' }, 409);

  // Deactivate any currently-active config whose window overlaps
  await prisma.feeConfig.updateMany({
    where: {
      isActive: true,
      id: { not: id },
    },
    data: { isActive: false },
  });

  const updated = await prisma.feeConfig.update({
    where: { id },
    data: { isActive: true },
  });

  await createAuditEvent({ action: 'FEE_CONFIG_ACTIVATED', actorId: admin.id, metadata: { configId: id, version: updated.version } });
  return c.json(updated);
});

app.delete('/v1/admin/fee-configs/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');

  const config = await prisma.feeConfig.findUnique({ where: { id } });
  if (!config) return c.json({ statusCode: 404, error: 'Not Found', message: 'Fee config not found' }, 404);
  if (config.isActive) return c.json({ statusCode: 409, error: 'Conflict', message: 'Cannot delete an active fee config' }, 409);

  await prisma.feeConfig.delete({ where: { id } });
  await createAuditEvent({ action: 'FEE_CONFIG_DELETED', actorId: admin.id, metadata: { configId: id, version: config.version } });
  return c.json({ success: true });
});

// ─── Seller Overrides ─────────────────────────────────────────────────────────

app.get('/v1/admin/fee-configs/:id/seller-overrides', ...adminGuard, async (c) => {
  const feeConfigId = c.req.param('id');
  const config = await prisma.feeConfig.findUnique({ where: { id: feeConfigId } });
  if (!config) return c.json({ statusCode: 404, error: 'Not Found', message: 'Fee config not found' }, 404);

  const overrides = await prisma.feeSellerOverride.findMany({
    where: { feeConfigId },
    include: { seller: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ data: overrides });
});

app.put('/v1/admin/fee-configs/:id/seller-overrides/:sellerId', ...adminGuard, async (c) => {
  const feeConfigId = c.req.param('id');
  const sellerId = c.req.param('sellerId');
  const admin = c.get('currentUser');

  const body = await c.req.json<{ commissionBps: number; reason?: string }>().catch(() => null);
  if (!body) return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body' }, 400);
  if (typeof body.commissionBps !== 'number' || body.commissionBps < 0 || body.commissionBps > 10_000) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'commissionBps must be a number between 0 and 10000' }, 400);
  }

  const config = await prisma.feeConfig.findUnique({ where: { id: feeConfigId } });
  if (!config) return c.json({ statusCode: 404, error: 'Not Found', message: 'Fee config not found' }, 404);

  const seller = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!seller) return c.json({ statusCode: 404, error: 'Not Found', message: 'Seller not found' }, 404);

  const override = await prisma.feeSellerOverride.upsert({
    where: { feeConfigId_sellerId: { feeConfigId, sellerId } },
    create: { feeConfigId, sellerId, commissionBps: body.commissionBps, reason: body.reason ?? null },
    update: { commissionBps: body.commissionBps, reason: body.reason ?? null },
    include: { seller: { select: { id: true, name: true, email: true } } },
  });

  await createAuditEvent({ action: 'FEE_SELLER_OVERRIDE_SET', actorId: admin.id, metadata: { configId: feeConfigId, sellerId, commissionBps: body.commissionBps } });
  return c.json(override);
});

app.delete('/v1/admin/fee-configs/:id/seller-overrides/:sellerId', ...adminGuard, async (c) => {
  const feeConfigId = c.req.param('id');
  const sellerId = c.req.param('sellerId');
  const admin = c.get('currentUser');

  const override = await prisma.feeSellerOverride.findUnique({
    where: { feeConfigId_sellerId: { feeConfigId, sellerId } },
  });
  if (!override) return c.json({ statusCode: 404, error: 'Not Found', message: 'Override not found' }, 404);

  await prisma.feeSellerOverride.delete({ where: { feeConfigId_sellerId: { feeConfigId, sellerId } } });
  await createAuditEvent({ action: 'FEE_SELLER_OVERRIDE_DELETED', actorId: admin.id, metadata: { configId: feeConfigId, sellerId } });
  return c.json({ success: true });
});

// ─── Promotions ───────────────────────────────────────────────────────────────

app.get('/v1/admin/fee-promotions', ...adminGuard, async (c) => {
  const pageNum = Math.max(1, Number(c.req.query('page') ?? '1'));
  const take = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '20')));
  const skip = (pageNum - 1) * take;

  const [items, total] = await Promise.all([
    prisma.feePromotion.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { seller: { select: { id: true, name: true, email: true } } },
    }),
    prisma.feePromotion.count(),
  ]);
  return c.json({ data: items, meta: { total, page: pageNum, perPage: take } });
});

app.post('/v1/admin/fee-promotions', ...adminGuard, async (c) => {
  const admin = c.get('currentUser');
  const body = await c.req.json<{
    feeConfigId?: string;
    code: string;
    discountBps: number;
    sellerId?: string;
    validFrom: string;
    validTo: string;
    maxUsages?: number;
  }>().catch(() => null);

  if (!body) return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body' }, 400);
  if (!body.code || typeof body.code !== 'string') return c.json({ statusCode: 400, error: 'Bad Request', message: 'code is required' }, 400);
  if (typeof body.discountBps !== 'number' || body.discountBps < 0 || body.discountBps > 10_000) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'discountBps must be a number between 0 and 10000' }, 400);
  }
  if (!body.validFrom || !body.validTo) return c.json({ statusCode: 400, error: 'Bad Request', message: 'validFrom and validTo are required' }, 400);

  const existing = await prisma.feePromotion.findUnique({ where: { code: body.code } });
  if (existing) return c.json({ statusCode: 409, error: 'Conflict', message: 'A promotion with this code already exists' }, 409);

  const promotion = await prisma.feePromotion.create({
    data: {
      feeConfigId: body.feeConfigId ?? null,
      code: body.code.toUpperCase(),
      discountBps: body.discountBps,
      sellerId: body.sellerId ?? null,
      validFrom: new Date(body.validFrom),
      validTo: new Date(body.validTo),
      maxUsages: body.maxUsages ?? null,
    },
    include: { seller: { select: { id: true, name: true, email: true } } },
  });

  await createAuditEvent({ action: 'FEE_PROMOTION_CREATED', actorId: admin.id, metadata: { promotionId: promotion.id, code: promotion.code } });
  return c.json(promotion, 201);
});

app.delete('/v1/admin/fee-promotions/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');

  const promotion = await prisma.feePromotion.findUnique({ where: { id } });
  if (!promotion) return c.json({ statusCode: 404, error: 'Not Found', message: 'Promotion not found' }, 404);

  await prisma.feePromotion.delete({ where: { id } });
  await createAuditEvent({ action: 'FEE_PROMOTION_DELETED', actorId: admin.id, metadata: { promotionId: id, code: promotion.code } });
  return c.json({ success: true });
});

export { app as adminFeeConfigRoutes };
