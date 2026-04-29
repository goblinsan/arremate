import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')] as const;

// ─── GET /v1/seller/payout-statement ─────────────────────────────────────────
//
// Returns the seller's payout statement: estimated (orders without a settled
// payable), payable (pending SellerPayables), and settled (PAID payables and
// ledger entries that are already in a PAID batch) totals.

app.get('/v1/seller/payout-statement', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');

  const [pendingPayables, batchedPayables, paidPayables, ledgerEntries, estimatedOrders] =
    await Promise.all([
      // Amounts owed but not yet batched
      prisma.sellerPayable.findMany({
        where: { sellerId: user.id, status: 'PENDING' },
        select: { id: true, amountCents: true, orderId: true, createdAt: true, status: true },
      }),

      // Amounts included in a batch but not yet disbursed
      prisma.sellerPayable.findMany({
        where: { sellerId: user.id, status: 'INCLUDED_IN_BATCH' },
        select: { id: true, amountCents: true, orderId: true, createdAt: true, status: true },
      }),

      // Amounts that have been paid out
      prisma.sellerPayable.findMany({
        where: { sellerId: user.id, status: 'PAID' },
        select: { id: true, amountCents: true, orderId: true, createdAt: true, status: true },
      }),

      // Ledger adjustments that are in PAID payout batches
      prisma.payoutEntry.findMany({
        where: {
          sellerId: user.id,
          ledgerEntryId: { not: null },
          batch: { status: 'PAID' },
        },
        select: { id: true, amountCents: true, description: true, createdAt: true },
      }),

      // Orders that are PAID but do not yet have a payable (legacy or edge-case)
      prisma.order.findMany({
        where: {
          sellerId: user.id,
          status: 'PAID',
          payable: null,
          sellerPayoutCents: { not: null },
        },
        select: {
          id: true,
          sellerPayoutCents: true,
          createdAt: true,
        },
      }),
    ]);

  const payableCents = pendingPayables.reduce((s, p) => s + p.amountCents, 0);
  const inBatchCents = batchedPayables.reduce((s, p) => s + p.amountCents, 0);
  const settledFromOrdersCents = paidPayables.reduce((s, p) => s + p.amountCents, 0);
  const settledFromLedgerCents = ledgerEntries.reduce((s, e) => s + e.amountCents, 0);
  const estimatedCents = estimatedOrders.reduce(
    (s, o) => s + (o.sellerPayoutCents ?? 0),
    0,
  );

  return c.json({
    estimatedCents,
    payableCents,
    inBatchCents,
    settledCents: settledFromOrdersCents + settledFromLedgerCents,
    totals: {
      pendingPayables: pendingPayables.length,
      batchedPayables: batchedPayables.length,
      paidPayables: paidPayables.length,
      estimatedOrders: estimatedOrders.length,
    },
    payables: [
      ...pendingPayables.map((p) => ({ ...p, source: 'ORDER' as const })),
      ...batchedPayables.map((p) => ({ ...p, source: 'ORDER' as const })),
      ...paidPayables.map((p) => ({ ...p, source: 'ORDER' as const })),
    ],
    settledLedgerEntries: ledgerEntries,
  });
});

export { app as sellerPayoutRoutes };
