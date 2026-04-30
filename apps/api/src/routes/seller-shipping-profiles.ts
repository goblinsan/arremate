import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')] as const;

const VALID_SHIPPING_TYPES = ['FREE', 'FLAT_RATE', 'DISCOUNTED'] as const;
type ShippingType = typeof VALID_SHIPPING_TYPES[number];

app.get('/v1/seller/shipping-profiles', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const profiles = await prisma.shippingProfile.findMany({
    where: { sellerId: user.id },
    orderBy: { createdAt: 'asc' },
  });
  return c.json({ data: profiles });
});

app.post('/v1/seller/shipping-profiles', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const { name, shippingType, shippingCents } = await c.req.json<{
    name: string;
    shippingType?: string;
    shippingCents?: number;
  }>();

  if (!name || name.trim() === '') {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'name is required' }, 400);
  }

  const resolvedType: ShippingType =
    shippingType && (VALID_SHIPPING_TYPES as readonly string[]).includes(shippingType)
      ? (shippingType as ShippingType)
      : 'FREE';

  if ((resolvedType === 'FLAT_RATE' || resolvedType === 'DISCOUNTED') && (shippingCents === undefined || shippingCents === null || shippingCents < 0)) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'shippingCents must be a non-negative number for FLAT_RATE or DISCOUNTED profiles' }, 400);
  }

  const profile = await prisma.shippingProfile.create({
    data: {
      sellerId: user.id,
      name: name.trim(),
      shippingType: resolvedType,
      shippingCents: resolvedType !== 'FREE' ? (shippingCents ?? null) : null,
    },
  });

  return c.json(profile, 201);
});

app.patch('/v1/seller/shipping-profiles/:id', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');
  const { name, shippingType, shippingCents } = await c.req.json<{
    name?: string;
    shippingType?: string;
    shippingCents?: number | null;
  }>();

  const profile = await prisma.shippingProfile.findUnique({ where: { id } });
  if (!profile || profile.sellerId !== user.id) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Shipping profile not found' }, 404);
  }

  const resolvedType: ShippingType | undefined =
    shippingType && (VALID_SHIPPING_TYPES as readonly string[]).includes(shippingType)
      ? (shippingType as ShippingType)
      : undefined;

  const effectiveType = resolvedType ?? profile.shippingType;
  const effectiveCents = shippingCents !== undefined ? shippingCents : profile.shippingCents;

  if ((effectiveType === 'FLAT_RATE' || effectiveType === 'DISCOUNTED') && (effectiveCents === null || effectiveCents === undefined || effectiveCents < 0)) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'shippingCents must be a non-negative number for FLAT_RATE or DISCOUNTED profiles' }, 400);
  }

  const updated = await prisma.shippingProfile.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(resolvedType !== undefined && { shippingType: resolvedType }),
      ...(shippingCents !== undefined && { shippingCents: effectiveType !== 'FREE' ? shippingCents : null }),
    },
  });

  return c.json(updated);
});

app.delete('/v1/seller/shipping-profiles/:id', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');

  const profile = await prisma.shippingProfile.findUnique({ where: { id } });
  if (!profile || profile.sellerId !== user.id) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Shipping profile not found' }, 404);
  }

  await prisma.shippingProfile.delete({ where: { id } });
  return c.body(null, 204);
});

export { app as sellerShippingProfileRoutes };
