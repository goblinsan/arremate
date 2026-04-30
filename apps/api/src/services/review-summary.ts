// ─── Review Summary Service ───────────────────────────────────────────────────
// Pure functions for computing quality, security, and budget signals for the
// agentic reviewer endpoint (GET /v1/admin/telemetry/review-summary).
// No I/O — all inputs are plain data objects so the functions are easy to test.

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignalStatus = 'ok' | 'warn' | 'critical' | 'unknown';

export interface BidSuccessRateSignal {
  totalBids: number;
  confirmedClaims: number;
  rate: number | null;
  status: SignalStatus;
}

export interface RequestHealthSignal {
  paidOrders: number;
  totalOrders: number;
  rate: number | null;
  status: SignalStatus;
}

export interface LatencyStatusSignal {
  avgResolutionMs: number | null;
  status: SignalStatus;
}

export interface PaymentFailureRateSignal {
  failedPayments: number;
  totalPayments: number;
  rate: number | null;
  status: SignalStatus;
}

export interface SuspiciousActivitySignal {
  count: number;
  status: SignalStatus;
}

export interface AuthFailuresSignal {
  count: number;
  status: SignalStatus;
}

export interface WebhookFailuresSignal {
  count: number;
  status: SignalStatus;
}

export interface RequestSurgeSignal {
  recentCount: number;
  baselinePerHour: number;
  surgeMultiplier: number | null;
  status: SignalStatus;
}

export interface DbUsageSignal {
  recentCount: number;
  status: SignalStatus;
}

export interface QualitySignals {
  status: SignalStatus;
  bidSuccessRate: BidSuccessRateSignal;
  requestHealth: RequestHealthSignal;
  latencyStatus: LatencyStatusSignal;
  paymentFailureRate: PaymentFailureRateSignal;
}

export interface SecuritySignals {
  status: SignalStatus;
  suspiciousActivity: SuspiciousActivitySignal;
  authFailures: AuthFailuresSignal;
  webhookFailures: WebhookFailuresSignal;
}

export interface BudgetSignals {
  status: SignalStatus;
  requestSurge: RequestSurgeSignal;
  dbUsage: DbUsageSignal;
}

export interface ReviewSummary {
  generatedAt: string;
  windowHours: number;
  status: SignalStatus;
  quality: QualitySignals;
  security: SecuritySignals;
  budget: BudgetSignals;
}

// ─── Quality signal computations ─────────────────────────────────────────────

/**
 * Compute bid success rate signal.
 * Rate = confirmedClaims / totalBids.
 * ok: >= 50 %, warn: 20–50 %, critical: < 20 % (unknown when no bids).
 */
export function computeBidSuccessRateSignal(
  totalBids: number,
  confirmedClaims: number,
): BidSuccessRateSignal {
  if (totalBids === 0) {
    return { totalBids: 0, confirmedClaims: 0, rate: null, status: 'unknown' };
  }
  const rate = confirmedClaims / totalBids;
  const status: SignalStatus = rate >= 0.5 ? 'ok' : rate >= 0.2 ? 'warn' : 'critical';
  return { totalBids, confirmedClaims, rate, status };
}

/**
 * Compute request health signal (paid order ratio).
 * Rate = paidOrders / totalOrders.
 * ok: >= 80 %, warn: 50–80 %, critical: < 50 % (unknown when no orders).
 */
export function computeRequestHealthSignal(
  paidOrders: number,
  totalOrders: number,
): RequestHealthSignal {
  if (totalOrders === 0) {
    return { paidOrders: 0, totalOrders: 0, rate: null, status: 'unknown' };
  }
  const rate = paidOrders / totalOrders;
  const status: SignalStatus = rate >= 0.8 ? 'ok' : rate >= 0.5 ? 'warn' : 'critical';
  return { paidOrders, totalOrders, rate, status };
}

/**
 * Compute latency status signal from average payment resolution time.
 * ok: < 30 s, warn: 30 s–5 min, critical: > 5 min (unknown when no data).
 */
export function computeLatencyStatusSignal(avgResolutionMs: number | null): LatencyStatusSignal {
  if (avgResolutionMs === null) {
    return { avgResolutionMs: null, status: 'unknown' };
  }
  const status: SignalStatus =
    avgResolutionMs < 30_000 ? 'ok' : avgResolutionMs < 300_000 ? 'warn' : 'critical';
  return { avgResolutionMs, status };
}

/**
 * Compute payment failure rate signal.
 * Rate = failedPayments / totalPayments.
 * ok: < 5 %, warn: 5–20 %, critical: >= 20 % (unknown when no payments).
 */
export function computePaymentFailureRateSignal(
  failedPayments: number,
  totalPayments: number,
): PaymentFailureRateSignal {
  if (totalPayments === 0) {
    return { failedPayments: 0, totalPayments: 0, rate: null, status: 'unknown' };
  }
  const rate = failedPayments / totalPayments;
  const status: SignalStatus = rate < 0.05 ? 'ok' : rate < 0.2 ? 'warn' : 'critical';
  return { failedPayments, totalPayments, rate, status };
}

// ─── Security signal computations ────────────────────────────────────────────

/**
 * Compute suspicious activity signal from open dispute + moderation counts.
 * ok: 0, warn: 1–5, critical: > 5.
 */
export function computeSuspiciousActivitySignal(count: number): SuspiciousActivitySignal {
  const status: SignalStatus = count === 0 ? 'ok' : count <= 5 ? 'warn' : 'critical';
  return { count, status };
}

/**
 * Compute auth failures signal from recently-suspended user count (proxy).
 * ok: 0, warn: 1–3, critical: > 3.
 */
export function computeAuthFailuresSignal(count: number): AuthFailuresSignal {
  const status: SignalStatus = count === 0 ? 'ok' : count <= 3 ? 'warn' : 'critical';
  return { count, status };
}

/**
 * Compute webhook failures signal from rejected/unrecognised webhook count.
 * ok: 0, warn: 1–3, critical: > 3.
 */
export function computeWebhookFailuresSignal(count: number): WebhookFailuresSignal {
  const status: SignalStatus = count === 0 ? 'ok' : count <= 3 ? 'warn' : 'critical';
  return { count, status };
}

// ─── Budget signal computations ───────────────────────────────────────────────

/**
 * Compute request surge signal.
 * surgeMultiplier = recentCount / baselinePerHour.
 * ok: < 2×, warn: 2–5×, critical: > 5× (unknown when no baseline).
 */
export function computeRequestSurgeSignal(
  recentCount: number,
  baselinePerHour: number,
): RequestSurgeSignal {
  if (baselinePerHour === 0) {
    return { recentCount, baselinePerHour: 0, surgeMultiplier: null, status: 'unknown' };
  }
  const surgeMultiplier = recentCount / baselinePerHour;
  const status: SignalStatus =
    surgeMultiplier < 2 ? 'ok' : surgeMultiplier <= 5 ? 'warn' : 'critical';
  return { recentCount, baselinePerHour, surgeMultiplier, status };
}

/**
 * Compute database usage signal from total new records in the window.
 * ok: < 1 000, warn: 1 000–10 000, critical: >= 10 000.
 */
export function computeDbUsageSignal(recentCount: number): DbUsageSignal {
  const status: SignalStatus =
    recentCount < 1_000 ? 'ok' : recentCount < 10_000 ? 'warn' : 'critical';
  return { recentCount, status };
}

// ─── Aggregate helpers ────────────────────────────────────────────────────────

/**
 * Derive the worst status from a list of individual signal statuses.
 * critical > warn > ok > unknown.
 */
export function computeOverallStatus(statuses: SignalStatus[]): SignalStatus {
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.includes('ok')) return 'ok';
  return 'unknown';
}

/**
 * Aggregate a group of quality signals into a group-level status and typed object.
 */
export function buildQualitySignals(
  bidSuccessRate: BidSuccessRateSignal,
  requestHealth: RequestHealthSignal,
  latencyStatus: LatencyStatusSignal,
  paymentFailureRate: PaymentFailureRateSignal,
): QualitySignals {
  const status = computeOverallStatus([
    bidSuccessRate.status,
    requestHealth.status,
    latencyStatus.status,
    paymentFailureRate.status,
  ]);
  return { status, bidSuccessRate, requestHealth, latencyStatus, paymentFailureRate };
}

/**
 * Aggregate a group of security signals into a group-level status and typed object.
 */
export function buildSecuritySignals(
  suspiciousActivity: SuspiciousActivitySignal,
  authFailures: AuthFailuresSignal,
  webhookFailures: WebhookFailuresSignal,
): SecuritySignals {
  const status = computeOverallStatus([
    suspiciousActivity.status,
    authFailures.status,
    webhookFailures.status,
  ]);
  return { status, suspiciousActivity, authFailures, webhookFailures };
}

/**
 * Aggregate a group of budget signals into a group-level status and typed object.
 */
export function buildBudgetSignals(
  requestSurge: RequestSurgeSignal,
  dbUsage: DbUsageSignal,
): BudgetSignals {
  const status = computeOverallStatus([requestSurge.status, dbUsage.status]);
  return { status, requestSurge, dbUsage };
}
