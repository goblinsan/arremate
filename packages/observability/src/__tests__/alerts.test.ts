import { describe, it, expect } from 'vitest';
import {
  AlertRules,
  availabilityAlerts,
  businessFailureAlerts,
  securityAlerts,
  budgetAlerts,
} from '../alerts.js';
import type { AlertRule, AlertSeverity } from '../alerts.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_SEVERITIES: AlertSeverity[] = ['critical', 'warning', 'info'];
const VALID_CONDITIONS: AlertRule['condition'][] = ['gt', 'gte', 'lt', 'lte'];

function assertValidRule(rule: AlertRule): void {
  expect(typeof rule.id).toBe('string');
  expect(rule.id.length).toBeGreaterThan(0);

  expect(typeof rule.name).toBe('string');
  expect(rule.name.length).toBeGreaterThan(0);

  expect(typeof rule.description).toBe('string');
  expect(rule.description.length).toBeGreaterThan(0);

  expect(VALID_SEVERITIES).toContain(rule.severity);
  expect(VALID_CONDITIONS).toContain(rule.condition);

  expect(typeof rule.signal).toBe('string');
  expect(rule.signal.length).toBeGreaterThan(0);

  expect(typeof rule.threshold).toBe('number');
  expect(isFinite(rule.threshold)).toBe(true);

  expect(typeof rule.windowSeconds).toBe('number');
  expect(rule.windowSeconds).toBeGreaterThan(0);

  expect(typeof rule.runbookSummary).toBe('string');
  expect(rule.runbookSummary.length).toBeGreaterThan(0);
}

// ─── availabilityAlerts ───────────────────────────────────────────────────────

describe('availabilityAlerts', () => {
  it('contains at least one rule', () => {
    expect(availabilityAlerts.length).toBeGreaterThan(0);
  });

  it('every rule passes structural validation', () => {
    for (const rule of availabilityAlerts) {
      assertValidRule(rule);
    }
  });

  it('includes a 5xx error rate rule with critical severity and 2% threshold', () => {
    const rule = availabilityAlerts.find((r) => r.id === 'availability.5xx_rate');
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe('critical');
    expect(rule!.threshold).toBe(0.02);
    expect(rule!.condition).toBe('gt');
  });

  it('includes a latency rule with warning severity and 1500ms threshold', () => {
    const rule = availabilityAlerts.find((r) => r.id === 'availability.latency_p95');
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe('warning');
    expect(rule!.threshold).toBe(1500);
    expect(rule!.condition).toBe('gt');
  });

  it('all rule IDs are unique', () => {
    const ids = availabilityAlerts.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── businessFailureAlerts ────────────────────────────────────────────────────

describe('businessFailureAlerts', () => {
  it('contains at least one rule', () => {
    expect(businessFailureAlerts.length).toBeGreaterThan(0);
  });

  it('every rule passes structural validation', () => {
    for (const rule of businessFailureAlerts) {
      assertValidRule(rule);
    }
  });

  it('includes a bid failure rate rule with warning severity and 5% threshold', () => {
    const rule = businessFailureAlerts.find((r) => r.id === 'business.bid_failure_rate');
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe('warning');
    expect(rule!.threshold).toBe(0.05);
    expect(rule!.signal).toBe('auction.bid.rejected');
  });

  it('includes a payment failure rate rule with critical severity and 3% threshold', () => {
    const rule = businessFailureAlerts.find((r) => r.id === 'business.payment_failure_rate');
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe('critical');
    expect(rule!.threshold).toBe(0.03);
    expect(rule!.signal).toBe('payment.creation.failed');
  });

  it('all rule IDs are unique', () => {
    const ids = businessFailureAlerts.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── securityAlerts ───────────────────────────────────────────────────────────

describe('securityAlerts', () => {
  it('contains at least one rule', () => {
    expect(securityAlerts.length).toBeGreaterThan(0);
  });

  it('every rule passes structural validation', () => {
    for (const rule of securityAlerts) {
      assertValidRule(rule);
    }
  });

  it('includes an auth failure spike rule with critical severity', () => {
    const rule = securityAlerts.find((r) => r.id === 'security.auth_failure_spike');
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe('critical');
    expect(rule!.signal).toBe('auth.login.failed');
    expect(rule!.threshold).toBeGreaterThan(0);
  });

  it('includes a suspicious request spike rule', () => {
    const rule = securityAlerts.find((r) => r.id === 'security.suspicious_request_spike');
    expect(rule).toBeDefined();
    expect(rule!.signal).toBe('security.invalid_request');
    expect(rule!.threshold).toBeGreaterThan(0);
  });

  it('includes a webhook failure spike rule with critical severity', () => {
    const rule = securityAlerts.find((r) => r.id === 'security.webhook_failure_spike');
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe('critical');
    expect(rule!.signal).toBe('webhook.rejected');
    expect(rule!.threshold).toBeGreaterThan(0);
  });

  it('all rule IDs are unique', () => {
    const ids = securityAlerts.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── budgetAlerts ─────────────────────────────────────────────────────────────

describe('budgetAlerts', () => {
  it('contains at least one rule', () => {
    expect(budgetAlerts.length).toBeGreaterThan(0);
  });

  it('every rule passes structural validation', () => {
    for (const rule of budgetAlerts) {
      assertValidRule(rule);
    }
  });

  it('includes a request surge rule', () => {
    const rule = budgetAlerts.find((r) => r.id === 'budget.request_surge');
    expect(rule).toBeDefined();
    expect(rule!.signal).toBe('usage.request.count');
    expect(rule!.threshold).toBeGreaterThan(0);
  });

  it('includes a DB query spike rule', () => {
    const rule = budgetAlerts.find((r) => r.id === 'budget.db_query_spike');
    expect(rule).toBeDefined();
    expect(rule!.signal).toBe('usage.db.query.count');
    expect(rule!.threshold).toBeGreaterThan(0);
  });

  it('includes a slow DB query spike rule', () => {
    const rule = budgetAlerts.find((r) => r.id === 'budget.db_slow_query_spike');
    expect(rule).toBeDefined();
    expect(rule!.signal).toBe('db.slow_query');
    expect(rule!.threshold).toBeGreaterThan(0);
  });

  it('all rule IDs are unique', () => {
    const ids = budgetAlerts.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── AlertRules aggregate ─────────────────────────────────────────────────────

describe('AlertRules', () => {
  it('exposes availability, businessFailures, security, and budget categories', () => {
    expect(Array.isArray(AlertRules.availability)).toBe(true);
    expect(Array.isArray(AlertRules.businessFailures)).toBe(true);
    expect(Array.isArray(AlertRules.security)).toBe(true);
    expect(Array.isArray(AlertRules.budget)).toBe(true);
  });

  it('AlertRules.all contains every rule from every category', () => {
    const expected =
      availabilityAlerts.length +
      businessFailureAlerts.length +
      securityAlerts.length +
      budgetAlerts.length;
    expect(AlertRules.all.length).toBe(expected);
  });

  it('every rule in AlertRules.all passes structural validation', () => {
    for (const rule of AlertRules.all) {
      assertValidRule(rule);
    }
  });

  it('all rule IDs across the entire set are unique', () => {
    const ids = AlertRules.all.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('AlertRules.availability references the same array as availabilityAlerts', () => {
    expect(AlertRules.availability).toBe(availabilityAlerts);
  });

  it('AlertRules.businessFailures references the same array as businessFailureAlerts', () => {
    expect(AlertRules.businessFailures).toBe(businessFailureAlerts);
  });

  it('AlertRules.security references the same array as securityAlerts', () => {
    expect(AlertRules.security).toBe(securityAlerts);
  });

  it('AlertRules.budget references the same array as budgetAlerts', () => {
    expect(AlertRules.budget).toBe(budgetAlerts);
  });
});
