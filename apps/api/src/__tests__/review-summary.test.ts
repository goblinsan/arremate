import { describe, it, expect } from 'vitest';
import {
  computeBidSuccessRateSignal,
  computeRequestHealthSignal,
  computeLatencyStatusSignal,
  computePaymentFailureRateSignal,
  computeSuspiciousActivitySignal,
  computeAuthFailuresSignal,
  computeWebhookFailuresSignal,
  computeRequestSurgeSignal,
  computeDbUsageSignal,
  computeOverallStatus,
  buildQualitySignals,
  buildSecuritySignals,
  buildBudgetSignals,
} from '../services/review-summary.js';

// ─── computeBidSuccessRateSignal ──────────────────────────────────────────────

describe('computeBidSuccessRateSignal', () => {
  it('returns unknown when there are no bids', () => {
    const result = computeBidSuccessRateSignal(0, 0);
    expect(result.rate).toBeNull();
    expect(result.status).toBe('unknown');
  });

  it('returns ok when rate >= 50 %', () => {
    const result = computeBidSuccessRateSignal(10, 6);
    expect(result.rate).toBeCloseTo(0.6);
    expect(result.status).toBe('ok');
  });

  it('returns warn when rate is between 20 % and 50 %', () => {
    const result = computeBidSuccessRateSignal(10, 3);
    expect(result.rate).toBeCloseTo(0.3);
    expect(result.status).toBe('warn');
  });

  it('returns critical when rate < 20 %', () => {
    const result = computeBidSuccessRateSignal(10, 1);
    expect(result.rate).toBeCloseTo(0.1);
    expect(result.status).toBe('critical');
  });

  it('returns ok at exactly 50 % boundary', () => {
    const result = computeBidSuccessRateSignal(10, 5);
    expect(result.rate).toBeCloseTo(0.5);
    expect(result.status).toBe('ok');
  });
});

// ─── computeRequestHealthSignal ───────────────────────────────────────────────

describe('computeRequestHealthSignal', () => {
  it('returns unknown when there are no orders', () => {
    const result = computeRequestHealthSignal(0, 0);
    expect(result.rate).toBeNull();
    expect(result.status).toBe('unknown');
  });

  it('returns ok when rate >= 80 %', () => {
    const result = computeRequestHealthSignal(9, 10);
    expect(result.rate).toBeCloseTo(0.9);
    expect(result.status).toBe('ok');
  });

  it('returns warn when rate is between 50 % and 80 %', () => {
    const result = computeRequestHealthSignal(6, 10);
    expect(result.rate).toBeCloseTo(0.6);
    expect(result.status).toBe('warn');
  });

  it('returns critical when rate < 50 %', () => {
    const result = computeRequestHealthSignal(2, 10);
    expect(result.rate).toBeCloseTo(0.2);
    expect(result.status).toBe('critical');
  });
});

// ─── computeLatencyStatusSignal ───────────────────────────────────────────────

describe('computeLatencyStatusSignal', () => {
  it('returns unknown when avgResolutionMs is null', () => {
    const result = computeLatencyStatusSignal(null);
    expect(result.avgResolutionMs).toBeNull();
    expect(result.status).toBe('unknown');
  });

  it('returns ok when avg < 30 s', () => {
    const result = computeLatencyStatusSignal(15_000);
    expect(result.status).toBe('ok');
  });

  it('returns warn when avg is between 30 s and 5 min', () => {
    const result = computeLatencyStatusSignal(60_000);
    expect(result.status).toBe('warn');
  });

  it('returns critical when avg >= 5 min', () => {
    const result = computeLatencyStatusSignal(600_000);
    expect(result.status).toBe('critical');
  });

  it('returns ok at exactly 29 999 ms', () => {
    expect(computeLatencyStatusSignal(29_999).status).toBe('ok');
  });

  it('returns warn at exactly 30 000 ms', () => {
    expect(computeLatencyStatusSignal(30_000).status).toBe('warn');
  });
});

// ─── computePaymentFailureRateSignal ──────────────────────────────────────────

describe('computePaymentFailureRateSignal', () => {
  it('returns unknown when there are no payments', () => {
    const result = computePaymentFailureRateSignal(0, 0);
    expect(result.rate).toBeNull();
    expect(result.status).toBe('unknown');
  });

  it('returns ok when rate < 5 %', () => {
    const result = computePaymentFailureRateSignal(2, 100);
    expect(result.rate).toBeCloseTo(0.02);
    expect(result.status).toBe('ok');
  });

  it('returns warn when rate is between 5 % and 20 %', () => {
    const result = computePaymentFailureRateSignal(10, 100);
    expect(result.rate).toBeCloseTo(0.1);
    expect(result.status).toBe('warn');
  });

  it('returns critical when rate >= 20 %', () => {
    const result = computePaymentFailureRateSignal(25, 100);
    expect(result.rate).toBeCloseTo(0.25);
    expect(result.status).toBe('critical');
  });
});

// ─── computeSuspiciousActivitySignal ──────────────────────────────────────────

describe('computeSuspiciousActivitySignal', () => {
  it('returns ok when count is 0', () => {
    expect(computeSuspiciousActivitySignal(0).status).toBe('ok');
  });

  it('returns warn when count is 1–5', () => {
    expect(computeSuspiciousActivitySignal(1).status).toBe('warn');
    expect(computeSuspiciousActivitySignal(5).status).toBe('warn');
  });

  it('returns critical when count > 5', () => {
    expect(computeSuspiciousActivitySignal(6).status).toBe('critical');
  });
});

// ─── computeAuthFailuresSignal ────────────────────────────────────────────────

describe('computeAuthFailuresSignal', () => {
  it('returns ok when count is 0', () => {
    expect(computeAuthFailuresSignal(0).status).toBe('ok');
  });

  it('returns warn when count is 1–3', () => {
    expect(computeAuthFailuresSignal(1).status).toBe('warn');
    expect(computeAuthFailuresSignal(3).status).toBe('warn');
  });

  it('returns critical when count > 3', () => {
    expect(computeAuthFailuresSignal(4).status).toBe('critical');
  });
});

// ─── computeWebhookFailuresSignal ─────────────────────────────────────────────

describe('computeWebhookFailuresSignal', () => {
  it('returns ok when count is 0', () => {
    expect(computeWebhookFailuresSignal(0).status).toBe('ok');
  });

  it('returns warn when count is 1–3', () => {
    expect(computeWebhookFailuresSignal(1).status).toBe('warn');
    expect(computeWebhookFailuresSignal(3).status).toBe('warn');
  });

  it('returns critical when count > 3', () => {
    expect(computeWebhookFailuresSignal(4).status).toBe('critical');
  });
});

// ─── computeRequestSurgeSignal ────────────────────────────────────────────────

describe('computeRequestSurgeSignal', () => {
  it('returns unknown when baseline is 0', () => {
    const result = computeRequestSurgeSignal(10, 0);
    expect(result.surgeMultiplier).toBeNull();
    expect(result.status).toBe('unknown');
  });

  it('returns ok when surge < 2×', () => {
    const result = computeRequestSurgeSignal(10, 8);
    expect(result.surgeMultiplier).toBeCloseTo(1.25);
    expect(result.status).toBe('ok');
  });

  it('returns warn when surge is 2–5×', () => {
    const result = computeRequestSurgeSignal(10, 3);
    expect(result.surgeMultiplier).toBeCloseTo(3.33, 1);
    expect(result.status).toBe('warn');
  });

  it('returns critical when surge > 5×', () => {
    const result = computeRequestSurgeSignal(60, 10);
    expect(result.surgeMultiplier).toBeCloseTo(6);
    expect(result.status).toBe('critical');
  });

  it('returns ok at exactly 2× boundary (just below)', () => {
    expect(computeRequestSurgeSignal(19, 10).status).toBe('ok');
  });

  it('returns warn at exactly 2× boundary', () => {
    expect(computeRequestSurgeSignal(20, 10).status).toBe('warn');
  });
});

// ─── computeDbUsageSignal ─────────────────────────────────────────────────────

describe('computeDbUsageSignal', () => {
  it('returns ok when count < 1 000', () => {
    expect(computeDbUsageSignal(500).status).toBe('ok');
  });

  it('returns warn when count is 1 000–9 999', () => {
    expect(computeDbUsageSignal(1_000).status).toBe('warn');
    expect(computeDbUsageSignal(9_999).status).toBe('warn');
  });

  it('returns critical when count >= 10 000', () => {
    expect(computeDbUsageSignal(10_000).status).toBe('critical');
  });
});

// ─── computeOverallStatus ─────────────────────────────────────────────────────

describe('computeOverallStatus', () => {
  it('returns critical when any status is critical', () => {
    expect(computeOverallStatus(['ok', 'warn', 'critical'])).toBe('critical');
  });

  it('returns warn when any status is warn and none are critical', () => {
    expect(computeOverallStatus(['ok', 'warn', 'unknown'])).toBe('warn');
  });

  it('returns ok when all statuses are ok', () => {
    expect(computeOverallStatus(['ok', 'ok'])).toBe('ok');
  });

  it('returns unknown when all statuses are unknown', () => {
    expect(computeOverallStatus(['unknown', 'unknown'])).toBe('unknown');
  });

  it('returns ok when mixed ok and unknown (no warn/critical)', () => {
    expect(computeOverallStatus(['ok', 'unknown'])).toBe('ok');
  });

  it('handles empty array as unknown', () => {
    expect(computeOverallStatus([])).toBe('unknown');
  });
});

// ─── buildQualitySignals ─────────────────────────────────────────────────────

describe('buildQualitySignals', () => {
  it('sets group status to worst individual signal', () => {
    const result = buildQualitySignals(
      computeBidSuccessRateSignal(10, 6),    // ok
      computeRequestHealthSignal(3, 10),     // critical
      computeLatencyStatusSignal(null),      // unknown
      computePaymentFailureRateSignal(0, 0), // unknown
    );
    expect(result.status).toBe('critical');
  });

  it('includes all four signal objects', () => {
    const result = buildQualitySignals(
      computeBidSuccessRateSignal(0, 0),
      computeRequestHealthSignal(0, 0),
      computeLatencyStatusSignal(null),
      computePaymentFailureRateSignal(0, 0),
    );
    expect(result).toHaveProperty('bidSuccessRate');
    expect(result).toHaveProperty('requestHealth');
    expect(result).toHaveProperty('latencyStatus');
    expect(result).toHaveProperty('paymentFailureRate');
  });
});

// ─── buildSecuritySignals ─────────────────────────────────────────────────────

describe('buildSecuritySignals', () => {
  it('sets group status to worst individual signal', () => {
    const result = buildSecuritySignals(
      computeSuspiciousActivitySignal(0), // ok
      computeAuthFailuresSignal(5),       // critical
      computeWebhookFailuresSignal(0),    // ok
    );
    expect(result.status).toBe('critical');
  });

  it('returns ok when all signals are ok', () => {
    const result = buildSecuritySignals(
      computeSuspiciousActivitySignal(0),
      computeAuthFailuresSignal(0),
      computeWebhookFailuresSignal(0),
    );
    expect(result.status).toBe('ok');
  });
});

// ─── buildBudgetSignals ───────────────────────────────────────────────────────

describe('buildBudgetSignals', () => {
  it('sets group status to worst individual signal', () => {
    const result = buildBudgetSignals(
      computeRequestSurgeSignal(60, 5), // critical
      computeDbUsageSignal(200),        // ok
    );
    expect(result.status).toBe('critical');
  });

  it('returns ok when both signals are ok', () => {
    const result = buildBudgetSignals(
      computeRequestSurgeSignal(1, 2), // ok (0.5×)
      computeDbUsageSignal(50),        // ok
    );
    expect(result.status).toBe('ok');
  });
});
