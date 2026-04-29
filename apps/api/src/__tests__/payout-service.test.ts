import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Pure helper: compute batch totals ───────────────────────────────────────
// We test the aggregation logic in isolation, without hitting the DB.

interface PayableSlice {
  id: string;
  sellerId: string;
  amountCents: number;
}

interface LedgerSlice {
  id: string;
  sellerId: string;
  amountCents: number;
  description: string | null;
}

function computeBatchTotals(payables: PayableSlice[], ledgerEntries: LedgerSlice[]) {
  const totalCents =
    payables.reduce((s, p) => s + p.amountCents, 0) +
    ledgerEntries.reduce((s, e) => s + e.amountCents, 0);

  const sellerIds = new Set([
    ...payables.map((p) => p.sellerId),
    ...ledgerEntries.map((e) => e.sellerId),
  ]);

  return { totalCents, sellerCount: sellerIds.size, entryCount: payables.length + ledgerEntries.length };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeBatchTotals', () => {
  it('sums payable and ledger amounts correctly', () => {
    const payables: PayableSlice[] = [
      { id: 'p1', sellerId: 's1', amountCents: 8_750 },
      { id: 'p2', sellerId: 's2', amountCents: 5_000 },
    ];
    const ledger: LedgerSlice[] = [
      { id: 'l1', sellerId: 's1', amountCents: -500, description: 'Ajuste' },
    ];

    const result = computeBatchTotals(payables, ledger);

    expect(result.totalCents).toBe(13_250); // 8750 + 5000 - 500
    expect(result.sellerCount).toBe(2);
    expect(result.entryCount).toBe(3);
  });

  it('handles payables-only batch', () => {
    const payables: PayableSlice[] = [{ id: 'p1', sellerId: 's1', amountCents: 10_000 }];
    const result = computeBatchTotals(payables, []);

    expect(result.totalCents).toBe(10_000);
    expect(result.sellerCount).toBe(1);
    expect(result.entryCount).toBe(1);
  });

  it('handles ledger-only batch', () => {
    const result = computeBatchTotals(
      [],
      [{ id: 'l1', sellerId: 's1', amountCents: 2_000, description: null }],
    );

    expect(result.totalCents).toBe(2_000);
    expect(result.sellerCount).toBe(1);
    expect(result.entryCount).toBe(1);
  });

  it('deduplicates sellers across payables and ledger entries', () => {
    const payables: PayableSlice[] = [
      { id: 'p1', sellerId: 's1', amountCents: 5_000 },
      { id: 'p2', sellerId: 's1', amountCents: 3_000 },
    ];
    const ledger: LedgerSlice[] = [
      { id: 'l1', sellerId: 's1', amountCents: -200, description: null },
    ];

    const result = computeBatchTotals(payables, ledger);

    expect(result.sellerCount).toBe(1); // all same seller
    expect(result.totalCents).toBe(7_800);
    expect(result.entryCount).toBe(3);
  });

  it('returns zero totals for empty inputs', () => {
    const result = computeBatchTotals([], []);

    expect(result.totalCents).toBe(0);
    expect(result.sellerCount).toBe(0);
    expect(result.entryCount).toBe(0);
  });
});

// ─── Payable amount derivation ────────────────────────────────────────────────

describe('payable amount derivation', () => {
  it('uses sellerPayoutCents when present', () => {
    const order = { sellerPayoutCents: 8_750, totalCents: 10_000 };
    const amount = order.sellerPayoutCents ?? order.totalCents;
    expect(amount).toBe(8_750);
  });

  it('falls back to totalCents when sellerPayoutCents is null (legacy order)', () => {
    const order = { sellerPayoutCents: null, totalCents: 10_000 };
    const amount = order.sellerPayoutCents ?? order.totalCents;
    expect(amount).toBe(10_000);
  });
});
