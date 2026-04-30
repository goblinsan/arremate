/**
 * Alert rule definitions for Arremate.
 *
 * Each rule describes a threshold condition that should be monitored by a log
 * aggregation pipeline (e.g. CloudWatch Metric Filters + Alarms, Datadog
 * monitors, or Grafana Loki alerting rules).  The rules are expressed as plain
 * data so they can be consumed by infrastructure-as-code tooling or rendered
 * into operator runbooks.
 *
 * ## How to wire these up in your log aggregator
 *
 * 1. All Arremate services emit newline-delimited JSON logs in production.
 * 2. Use the `metric` field to identify metric records and the `event` field
 *    to identify event records.
 * 3. Each `AlertRule` describes the exact field names and threshold values to
 *    configure in your monitoring platform.
 *
 * @module
 */

// ─── Severity ─────────────────────────────────────────────────────────────────

/** Urgency level used to route and prioritise alert notifications. */
export type AlertSeverity = 'critical' | 'warning' | 'info';

// ─── AlertRule ────────────────────────────────────────────────────────────────

/**
 * A single alert rule definition.
 *
 * Rules are expressed as structured data so that they can be consumed by any
 * log-aggregation or Infrastructure-as-Code tool (CloudWatch, Datadog,
 * Terraform, etc.) without baking in provider-specific syntax.
 */
export interface AlertRule {
  /** Short machine-readable identifier (e.g. `availability.5xx_rate`). */
  id: string;
  /** Human-readable name shown in alert notifications. */
  name: string;
  /** Full description of what the rule monitors and why it matters. */
  description: string;
  /** Urgency level used for routing and notification channels. */
  severity: AlertSeverity;
  /**
   * The metric or event field name whose value is compared against
   * {@link threshold}.  Matches the `metric` field in metric log entries or
   * the `event` field in event log entries.
   */
  signal: string;
  /** Condition operator used when comparing the signal to the threshold. */
  condition: 'gt' | 'gte' | 'lt' | 'lte';
  /**
   * Numeric threshold value.  The alert fires when the aggregated signal
   * satisfies `signal <condition> threshold` over the evaluation window.
   */
  threshold: number;
  /**
   * Evaluation window in seconds.  The signal is aggregated (e.g. summed or
   * averaged) over this rolling period before the condition is tested.
   */
  windowSeconds: number;
  /**
   * Short summary of the recommended first response.  Operators can use this
   * to auto-populate runbook links or on-call playbook entries.
   */
  runbookSummary: string;
}

// ─── Alert categories ─────────────────────────────────────────────────────────

/**
 * Availability and latency alert rules.
 *
 * Covers issue #261: 5xx error rate and response latency thresholds.
 */
export const availabilityAlerts: readonly AlertRule[] = [
  {
    id: 'availability.5xx_rate',
    name: 'High 5xx Error Rate',
    description:
      'The proportion of HTTP requests that resulted in a 5xx server error has exceeded 2 %' +
      ' over a 5-minute window.  This may indicate a deployment regression, an unhandled' +
      ' exception, or an infrastructure outage.',
    severity: 'critical',
    signal: 'usage.request.count',
    condition: 'gt',
    threshold: 0.02,
    windowSeconds: 300,
    runbookSummary:
      'Check API logs for unhandled exceptions (level=error).  Review recent deployments.' +
      ' See docs/runbooks/incident-response.md.',
  },
  {
    id: 'availability.latency_p95',
    name: 'High API Response Latency (p95)',
    description:
      'The 95th-percentile HTTP response latency has exceeded 1 500 ms over a 5-minute' +
      ' window.  This may signal slow database queries, downstream provider latency, or' +
      ' insufficient compute resources.',
    severity: 'warning',
    signal: 'usage.request.duration_ms',
    condition: 'gt',
    threshold: 1500,
    windowSeconds: 300,
    runbookSummary:
      'Check usage.db.query.duration metrics and db.slow_query events for slow queries.' +
      ' Review external provider call durations.  See docs/runbooks/incident-response.md.',
  },
] as const;

/**
 * Business failure alert rules.
 *
 * Covers issue #262: bid rejection rate and payment creation failure rate.
 */
export const businessFailureAlerts: readonly AlertRule[] = [
  {
    id: 'business.bid_failure_rate',
    name: 'High Bid Failure Rate',
    description:
      'The proportion of bid attempts that were rejected has exceeded 5 % over a 5-minute' +
      ' window.  Elevated bid rejection can degrade seller revenue and buyer trust during' +
      ' live auction sessions.',
    severity: 'warning',
    signal: 'auction.bid.rejected',
    condition: 'gt',
    threshold: 0.05,
    windowSeconds: 300,
    runbookSummary:
      'Review auction.bid.rejected events for rejection reasons (e.g. show not live,' +
      ' price validation errors).  Check for seller show configuration issues.',
  },
  {
    id: 'business.payment_failure_rate',
    name: 'High Payment Failure Rate',
    description:
      'The proportion of Pix payment creation attempts that failed has exceeded 3 % over a' +
      ' 5-minute window.  Payment failures block order completion and directly reduce GMV.',
    severity: 'critical',
    signal: 'payment.creation.failed',
    condition: 'gt',
    threshold: 0.03,
    windowSeconds: 300,
    runbookSummary:
      'Check payment.creation.failed events for provider error codes.  Verify EfiPay' +
      ' credentials and sandbox/production mode.  See docs/runbooks/incident-response.md.',
  },
] as const;

/**
 * Security anomaly alert rules.
 *
 * Covers issue #263: authentication failure spikes, suspicious request
 * patterns, and webhook failure spikes.
 */
export const securityAlerts: readonly AlertRule[] = [
  {
    id: 'security.auth_failure_spike',
    name: 'Authentication Failure Spike',
    description:
      'More than 20 authentication failures (auth.login.failed or auth.token.invalid) have' +
      ' been recorded in a 5-minute window.  This may indicate a credential-stuffing or' +
      ' brute-force attack.',
    severity: 'critical',
    signal: 'auth.login.failed',
    condition: 'gt',
    threshold: 20,
    windowSeconds: 300,
    runbookSummary:
      'Review auth.login.failed and auth.token.invalid events for offending IPs or' +
      ' user IDs.  Consider temporary IP block or account lock.  Notify the security team.',
  },
  {
    id: 'security.invalid_token_spike',
    name: 'Invalid Token Spike',
    description:
      'More than 20 invalid-token rejections (auth.token.invalid) have been recorded in a' +
      ' 5-minute window.  This can indicate token replay attacks or a misconfigured client.',
    severity: 'warning',
    signal: 'auth.token.invalid',
    condition: 'gt',
    threshold: 20,
    windowSeconds: 300,
    runbookSummary:
      'Review auth.token.invalid events to identify the affected userId or IP.' +
      ' Check whether a recent key rotation caused client misconfiguration.',
  },
  {
    id: 'security.suspicious_request_spike',
    name: 'Suspicious Request Pattern Spike',
    description:
      'More than 50 requests rejected due to suspicious or malformed payloads' +
      ' (security.invalid_request) have been recorded in a 5-minute window.  This may' +
      ' indicate a scanning or injection attempt.',
    severity: 'warning',
    signal: 'security.invalid_request',
    condition: 'gt',
    threshold: 50,
    windowSeconds: 300,
    runbookSummary:
      'Review security.invalid_request events for offending routes and payloads.' +
      ' Consider tightening input validation or adding a WAF rule.',
  },
  {
    id: 'security.webhook_failure_spike',
    name: 'Webhook Failure Spike',
    description:
      'More than 10 inbound webhook rejections (webhook.rejected) have been recorded in a' +
      ' 5-minute window.  This may indicate a compromised or misconfigured provider,' +
      ' a replay attack, or a signature-key rotation that was not propagated.',
    severity: 'critical',
    signal: 'webhook.rejected',
    condition: 'gt',
    threshold: 10,
    windowSeconds: 300,
    runbookSummary:
      'Review webhook.rejected events for rejection reasons (bad signature, unknown event).' +
      ' Verify EFIPAY_WEBHOOK_SECRET is correct.  See docs/runbooks/incident-response.md.',
  },
] as const;

/**
 * Budget and usage alert rules.
 *
 * Covers issue #264: request volume surges and database usage spikes that may
 * indicate unexpected cost growth.
 */
export const budgetAlerts: readonly AlertRule[] = [
  {
    id: 'budget.request_surge',
    name: 'Request Volume Surge',
    description:
      'Total HTTP request count (usage.request.count) has exceeded 1 000 requests in a' +
      ' 1-minute window.  A sudden surge may indicate a DDoS attempt, a runaway client,' +
      ' or a viral traffic event that will drive unexpected infrastructure costs.',
    severity: 'warning',
    signal: 'usage.request.count',
    condition: 'gt',
    threshold: 1000,
    windowSeconds: 60,
    runbookSummary:
      'Review usage.request.count by route and status class to distinguish legitimate' +
      ' traffic growth from abuse.  Enable rate limiting or scale compute if required.',
  },
  {
    id: 'budget.db_query_spike',
    name: 'Database Query Rate Spike',
    description:
      'Total database query count (usage.db.query.count) has exceeded 5 000 queries in a' +
      ' 1-minute window.  A query spike can saturate the Neon connection pool, cause' +
      ' latency regressions, and increase database compute costs.',
    severity: 'warning',
    signal: 'usage.db.query.count',
    condition: 'gt',
    threshold: 5000,
    windowSeconds: 60,
    runbookSummary:
      'Review usage.db.query.count by model and operation.  Check for missing indexes or' +
      ' N+1 query patterns.  Consider read replicas or query result caching.',
  },
  {
    id: 'budget.db_slow_query_spike',
    name: 'Slow Database Query Spike',
    description:
      'More than 10 slow database queries (db.slow_query, ≥ 500 ms) have been recorded in' +
      ' a 5-minute window.  Persistent slow queries will degrade API latency and may' +
      ' indicate missing indexes or lock contention.',
    severity: 'warning',
    signal: 'db.slow_query',
    condition: 'gt',
    threshold: 10,
    windowSeconds: 300,
    runbookSummary:
      'Review db.slow_query events for model and operation.  Use EXPLAIN ANALYZE on the' +
      ' offending queries.  Add missing indexes via a new Prisma migration.',
  },
] as const;

// ─── Aggregated export ────────────────────────────────────────────────────────

/**
 * All alert rules grouped by category.
 *
 * Use this object when iterating over the complete rule set, for example to
 * generate Terraform monitoring resources or to render an operator runbook.
 *
 * @example
 * import { AlertRules } from '@arremate/observability';
 * for (const rule of AlertRules.availability) {
 *   console.log(rule.id, rule.threshold);
 * }
 */
export const AlertRules = {
  /** Availability and latency rules (issue #261). */
  availability: availabilityAlerts,
  /** Business failure rules (issue #262). */
  businessFailures: businessFailureAlerts,
  /** Security anomaly rules (issue #263). */
  security: securityAlerts,
  /** Budget and usage rules (issue #264). */
  budget: budgetAlerts,
  /** Flat list of every rule across all categories. */
  all: [
    ...availabilityAlerts,
    ...businessFailureAlerts,
    ...securityAlerts,
    ...budgetAlerts,
  ] as AlertRule[],
} as const;
