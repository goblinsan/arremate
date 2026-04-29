import { Hono } from 'hono';
import { prisma, Prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

// ─── Tax Configs ──────────────────────────────────────────────────────────────

app.get('/v1/admin/tax-configs', ...adminGuard, async (c) => {
  const configs = await prisma.taxConfig.findMany({
    orderBy: [{ effectiveFrom: 'desc' }],
  });
  return c.json({ data: configs });
});

app.get('/v1/admin/tax-configs/active', ...adminGuard, async (c) => {
  const now = new Date();
  const config = await prisma.taxConfig.findFirst({
    where: {
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!config) return c.json({ statusCode: 404, error: 'Not Found', message: 'No active tax configuration' }, 404);
  return c.json(config);
});

app.get('/v1/admin/tax-configs/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const config = await prisma.taxConfig.findUnique({ where: { id } });
  if (!config) return c.json({ statusCode: 404, error: 'Not Found', message: 'Tax config not found' }, 404);
  return c.json(config);
});

app.post('/v1/admin/tax-configs', ...adminGuard, async (c) => {
  const admin = c.get('currentUser');
  const body = await c.req.json<{
    label?: string;
    platformServiceTaxRateBps?: number;
    goodsSaleTaxModel?: 'SELLER_ISSUED' | 'EXEMPT' | 'MARKETPLACE_FACILITATED';
    metadata?: Record<string, unknown>;
    effectiveFrom: string;
    effectiveTo?: string;
  }>().catch(() => null);

  if (!body) return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body' }, 400);
  if (!body.effectiveFrom) return c.json({ statusCode: 400, error: 'Bad Request', message: 'effectiveFrom is required' }, 400);

  const taxRateBps = body.platformServiceTaxRateBps ?? 0;
  if (typeof taxRateBps !== 'number' || taxRateBps < 0 || taxRateBps > 10_000) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'platformServiceTaxRateBps must be a number between 0 and 10000' }, 400);
  }

  const goodsSaleTaxModel = body.goodsSaleTaxModel ?? 'SELLER_ISSUED';
  if (!['SELLER_ISSUED', 'EXEMPT', 'MARKETPLACE_FACILITATED'].includes(goodsSaleTaxModel)) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'goodsSaleTaxModel must be SELLER_ISSUED, EXEMPT, or MARKETPLACE_FACILITATED' }, 400);
  }

  const config = await prisma.taxConfig.create({
    data: {
      label: body.label ?? null,
      isActive: false,
      platformServiceTaxRateBps: taxRateBps,
      goodsSaleTaxModel,
      metadata: (body.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      effectiveFrom: new Date(body.effectiveFrom),
      effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
    },
  });

  await createAuditEvent({
    action: 'TAX_CONFIG_CREATED',
    actorId: admin.id,
    metadata: { taxConfigId: config.id },
  });

  return c.json(config, 201);
});

app.post('/v1/admin/tax-configs/:id/activate', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');

  const config = await prisma.taxConfig.findUnique({ where: { id } });
  if (!config) return c.json({ statusCode: 404, error: 'Not Found', message: 'Tax config not found' }, 404);
  if (config.isActive) return c.json({ statusCode: 409, error: 'Conflict', message: 'Tax config is already active' }, 409);

  await prisma.taxConfig.updateMany({
    where: { isActive: true, id: { not: id } },
    data: { isActive: false },
  });

  const updated = await prisma.taxConfig.update({
    where: { id },
    data: { isActive: true },
  });

  await createAuditEvent({
    action: 'TAX_CONFIG_ACTIVATED',
    actorId: admin.id,
    metadata: { taxConfigId: id },
  });

  return c.json(updated);
});

app.delete('/v1/admin/tax-configs/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');

  const config = await prisma.taxConfig.findUnique({ where: { id } });
  if (!config) return c.json({ statusCode: 404, error: 'Not Found', message: 'Tax config not found' }, 404);
  if (config.isActive) return c.json({ statusCode: 409, error: 'Conflict', message: 'Cannot delete an active tax config' }, 409);

  await prisma.taxConfig.delete({ where: { id } });
  await createAuditEvent({
    action: 'TAX_CONFIG_DELETED',
    actorId: admin.id,
    metadata: { taxConfigId: id },
  });

  return c.json({ success: true });
});

export { app as adminTaxConfigRoutes };
