import { prisma } from '@arremate/database';
import type { Prisma } from '@arremate/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeneratePayoutBatchParams {
  periodStart: Date;
  periodEnd: Date;
  /** When set, only include payables and ledger entries for this seller. */
  sellerId?: string;
  notes?: string;
}

export interface PayoutBatchResult {
  batchId: string;
  status: string;
  totalCents: number;
  entryCount: number;
  sellerCount: number;
}

// ─── Create a payable when an order becomes PAID ──────────────────────────────

/**
 * Creates a SellerPayable for a paid order inside the provided transaction (or
 * a standalone one if none is given).  Idempotent: if a payable already exists
 * for the order it is returned unchanged.
 */
export async function createPayableFromOrder(
  orderId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      sellerId: true,
      status: true,
      sellerPayoutCents: true,
      totalCents: true,
      payable: { select: { id: true } },
    },
  });

  if (!order) return;
  if (order.status !== 'PAID') return;
  if (order.payable) return; // already created — idempotent

  const amountCents = order.sellerPayoutCents ?? order.totalCents;

  await db.sellerPayable.create({
    data: {
      sellerId: order.sellerId,
      orderId: order.id,
      amountCents,
      status: 'PENDING',
    },
  });
}

// ─── Generate a payout batch from pending payables and ledger entries ─────────

/**
 * Groups all PENDING seller payables (and any SettlementLedgerEntries not yet
 * in a batch) created within [periodStart, periodEnd] into a new PayoutBatch.
 *
 * Returns null when there is nothing to batch.
 */
export async function generatePayoutBatch(
  params: GeneratePayoutBatchParams,
): Promise<PayoutBatchResult | null> {
  const { periodStart, periodEnd, sellerId, notes } = params;

  const payableWhere: Prisma.SellerPayableWhereInput = {
    status: 'PENDING',
    createdAt: { gte: periodStart, lte: periodEnd },
    ...(sellerId ? { sellerId } : {}),
  };

  const ledgerWhere: Prisma.SettlementLedgerEntryWhereInput = {
    payoutEntry: null,
    createdAt: { gte: periodStart, lte: periodEnd },
    ...(sellerId ? { sellerId } : {}),
  };

  const [payables, ledgerEntries] = await Promise.all([
    prisma.sellerPayable.findMany({
      where: payableWhere,
      select: { id: true, sellerId: true, amountCents: true },
    }),
    prisma.settlementLedgerEntry.findMany({
      where: ledgerWhere,
      select: { id: true, sellerId: true, amountCents: true, description: true },
    }),
  ]);

  if (payables.length === 0 && ledgerEntries.length === 0) {
    return null;
  }

  const totalCents =
    payables.reduce((s, p) => s + p.amountCents, 0) +
    ledgerEntries.reduce((s, e) => s + e.amountCents, 0);

  const sellerIds = new Set([
    ...payables.map((p) => p.sellerId),
    ...ledgerEntries.map((e) => e.sellerId),
  ]);

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.payoutBatch.create({
      data: {
        status: 'PENDING',
        periodStart,
        periodEnd,
        totalCents,
        notes: notes ?? null,
      },
    });

    // Create entries for payables
    for (const payable of payables) {
      await tx.payoutEntry.create({
        data: {
          batchId: created.id,
          sellerId: payable.sellerId,
          amountCents: payable.amountCents,
          description: 'Repasse de pedido pago',
          payableId: payable.id,
        },
      });
      await tx.sellerPayable.update({
        where: { id: payable.id },
        data: { status: 'INCLUDED_IN_BATCH' },
      });
    }

    // Create entries for ledger adjustments
    for (const entry of ledgerEntries) {
      await tx.payoutEntry.create({
        data: {
          batchId: created.id,
          sellerId: entry.sellerId,
          amountCents: entry.amountCents,
          description: entry.description ?? 'Ajuste de liquidação',
          ledgerEntryId: entry.id,
        },
      });
    }

    return created;
  });

  return {
    batchId: batch.id,
    status: batch.status,
    totalCents,
    entryCount: payables.length + ledgerEntries.length,
    sellerCount: sellerIds.size,
  };
}
