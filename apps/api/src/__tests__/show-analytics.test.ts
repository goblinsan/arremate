import { describe, it, expect } from 'vitest';

// ─── Pure helpers extracted for unit testing ─────────────────────────────────

function computeSalesMetrics(orders: { totalCents: number; status: string; sellerPayoutCents: number | null }[]) {
  const estimatedSalesCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
  const completedEarningsCents = orders
    .filter((o) => o.status === 'PAID')
    .reduce((sum, o) => sum + (o.sellerPayoutCents ?? 0), 0);
  const totalOrders = orders.length;
  const averageOrderValueCents = totalOrders > 0 ? Math.round(estimatedSalesCents / totalOrders) : 0;
  return { estimatedSalesCents, completedEarningsCents, totalOrders, averageOrderValueCents };
}

function computeShowDuration(sessions: { startedAt: Date | null; endedAt: Date | null }[]): number | null {
  let showDurationSeconds: number | null = null;
  for (const session of sessions) {
    if (session.startedAt && session.endedAt) {
      const durationSec = Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000);
      if (showDurationSeconds === null || durationSec > showDurationSeconds) {
        showDurationSeconds = durationSec;
      }
    }
  }
  return showDurationSeconds;
}

function computeAverageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10;
}

function computeBuyerSegments(
  buyerIds: string[],
  priorBuyerIds: string[],
): { firstTimeBuyers: number; returningBuyers: number } {
  const priorSet = new Set(priorBuyerIds);
  const firstTimeBuyers = buyerIds.filter((id) => !priorSet.has(id)).length;
  const returningBuyers = buyerIds.length - firstTimeBuyers;
  return { firstTimeBuyers, returningBuyers };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeSalesMetrics', () => {
  it('returns zeros for empty orders', () => {
    const result = computeSalesMetrics([]);
    expect(result.estimatedSalesCents).toBe(0);
    expect(result.completedEarningsCents).toBe(0);
    expect(result.totalOrders).toBe(0);
    expect(result.averageOrderValueCents).toBe(0);
  });

  it('sums totalCents for estimated sales', () => {
    const orders = [
      { totalCents: 1000, status: 'PENDING_PAYMENT', sellerPayoutCents: null },
      { totalCents: 2000, status: 'PAID', sellerPayoutCents: 1700 },
    ];
    const result = computeSalesMetrics(orders);
    expect(result.estimatedSalesCents).toBe(3000);
    expect(result.totalOrders).toBe(2);
    expect(result.averageOrderValueCents).toBe(1500);
  });

  it('only sums PAID sellerPayoutCents for completedEarnings', () => {
    const orders = [
      { totalCents: 1000, status: 'PENDING_PAYMENT', sellerPayoutCents: 850 },
      { totalCents: 2000, status: 'PAID', sellerPayoutCents: 1700 },
      { totalCents: 3000, status: 'PAID', sellerPayoutCents: null },
    ];
    const result = computeSalesMetrics(orders);
    expect(result.completedEarningsCents).toBe(1700);
  });

  it('rounds average order value', () => {
    const orders = [
      { totalCents: 100, status: 'PAID', sellerPayoutCents: 85 },
      { totalCents: 200, status: 'PAID', sellerPayoutCents: 170 },
      { totalCents: 300, status: 'PAID', sellerPayoutCents: 255 },
    ];
    const result = computeSalesMetrics(orders);
    expect(result.averageOrderValueCents).toBe(200);
  });
});

describe('computeShowDuration', () => {
  it('returns null when no sessions have times', () => {
    expect(computeShowDuration([])).toBeNull();
    expect(computeShowDuration([{ startedAt: null, endedAt: null }])).toBeNull();
  });

  it('computes duration for a single session', () => {
    const start = new Date('2024-01-01T10:00:00Z');
    const end = new Date('2024-01-01T11:30:00Z');
    expect(computeShowDuration([{ startedAt: start, endedAt: end }])).toBe(5400);
  });

  it('returns the longest duration when multiple sessions exist', () => {
    const sessions = [
      { startedAt: new Date('2024-01-01T10:00:00Z'), endedAt: new Date('2024-01-01T10:30:00Z') },
      { startedAt: new Date('2024-01-01T11:00:00Z'), endedAt: new Date('2024-01-01T13:00:00Z') },
    ];
    expect(computeShowDuration(sessions)).toBe(7200);
  });
});

describe('computeAverageRating', () => {
  it('returns null for empty ratings', () => {
    expect(computeAverageRating([])).toBeNull();
  });

  it('returns single rating as-is', () => {
    expect(computeAverageRating([5])).toBe(5);
  });

  it('averages and rounds to one decimal', () => {
    expect(computeAverageRating([4, 5])).toBe(4.5);
    expect(computeAverageRating([4, 4, 5])).toBe(4.3);
  });
});

describe('computeBuyerSegments', () => {
  it('all buyers are first-time when no prior buyers', () => {
    const result = computeBuyerSegments(['a', 'b', 'c'], []);
    expect(result.firstTimeBuyers).toBe(3);
    expect(result.returningBuyers).toBe(0);
  });

  it('correctly splits first-time vs returning', () => {
    const result = computeBuyerSegments(['a', 'b', 'c', 'd'], ['b', 'c']);
    expect(result.firstTimeBuyers).toBe(2);
    expect(result.returningBuyers).toBe(2);
  });

  it('all buyers are returning when all have prior history', () => {
    const result = computeBuyerSegments(['a', 'b'], ['a', 'b', 'c']);
    expect(result.firstTimeBuyers).toBe(0);
    expect(result.returningBuyers).toBe(2);
  });

  it('returns zeros for empty buyer list', () => {
    const result = computeBuyerSegments([], ['a', 'b']);
    expect(result.firstTimeBuyers).toBe(0);
    expect(result.returningBuyers).toBe(0);
  });
});
