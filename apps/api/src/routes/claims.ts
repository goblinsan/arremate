import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const CLAIM_EXPIRY_MINUTES = 15;

async function expireIfOverdue(claimId: string, expiresAt: Date, currentStatus: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED') {
  if (currentStatus !== 'PENDING') return currentStatus;
  if (expiresAt > new Date()) return currentStatus;
  await prisma.claim.update({ where: { id: claimId }, data: { status: 'EXPIRED' } });
  return 'EXPIRED';
}

app.post('/v1/sessions/:sessionId/claim', authenticate, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');
  const session = await prisma.showSession.findUnique({
    where: { id: sessionId },
    include: { pinnedItem: { include: { inventoryItem: true } } },
  });
  if (!session) return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  if (session.status !== 'LIVE') return c.json({ statusCode: 409, error: 'Conflict', message: 'Claims are only accepted during a LIVE session' }, 409);
  if (!session.pinnedItem || !session.pinnedItemId) return c.json({ statusCode: 409, error: 'Conflict', message: 'No item is currently available for claim' }, 409);
  if (session.pinnedItem.soldOut) return c.json({ statusCode: 409, error: 'Conflict', message: 'This item is no longer available' }, 409);
  const existingClaim = await prisma.claim.findFirst({
    where: { sessionId, buyerId: user.id, queueItemId: session.pinnedItemId, status: { in: ['PENDING', 'CONFIRMED'] } },
  });
  if (existingClaim) return c.json({ statusCode: 409, error: 'Conflict', message: 'You already have an active claim for this item' }, 409);
  const priceAtClaim = session.pinnedItem.currentBid ?? session.pinnedItem.inventoryItem.startingPrice;
  const expiresAt = new Date(Date.now() + CLAIM_EXPIRY_MINUTES * 60 * 1000);
  const [claim] = await prisma.$transaction([
    prisma.claim.create({
      data: { sessionId, buyerId: user.id, queueItemId: session.pinnedItemId, priceAtClaim, expiresAt },
      include: { queueItem: { include: { inventoryItem: true } } },
    }),
    prisma.showInventoryItem.update({ where: { id: session.pinnedItemId }, data: { soldOut: true } }),
  ]);
  return c.json(claim, 201);
});

app.get('/v1/claims/:claimId', authenticate, async (c) => {
  const user = c.get('currentUser');
  const claimId = c.req.param('claimId');
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { queueItem: { include: { inventoryItem: true } } },
  });
  if (!claim || claim.buyerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Claim not found' }, 404);
  const currentStatus = await expireIfOverdue(claim.id, claim.expiresAt, claim.status);
  return c.json({ ...claim, status: currentStatus });
});

export { app as claimRoutes };
