import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  trackEvent,
  trackMetric,
  setDeploymentContext,
  TelemetryEvents,
} from '../index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the JSON context object embedded in a non-production log line.
 * Non-production format: "[ts] [LEVEL] msg {…json…}"
 */
function parseDevLogContext(line: string): Record<string, unknown> {
  const jsonStart = line.indexOf('{');
  if (jsonStart === -1) return {};
  return JSON.parse(line.slice(jsonStart)) as Record<string, unknown>;
}

// ─── trackEvent ───────────────────────────────────────────────────────────────

describe('trackEvent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Reset deployment context between tests
    setDeploymentContext({ service: undefined, deploymentVersion: undefined, gitSha: undefined });
  });

  it('emits a structured log entry with an event field matching the event name', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackEvent(TelemetryEvents.PAYMENT_PAID);

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.event).toBe('payment.paid');
  });

  it('always includes a ts field in the event record', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackEvent(TelemetryEvents.AUCTION_BID_PLACED);

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(typeof ctx.ts).toBe('string');
    // Should be a valid ISO-8601 timestamp
    expect(new Date(ctx.ts as string).toISOString()).toBe(ctx.ts);
  });

  it('merges extra payload fields into the event record', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackEvent(TelemetryEvents.WEBHOOK_RECEIVED, {
      provider: 'efipay',
      deliveryId: 'abc-123',
    });

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.event).toBe('webhook.received');
    expect(ctx.provider).toBe('efipay');
    expect(ctx.deliveryId).toBe('abc-123');
  });

  it('attaches deployment context fields when set', () => {
    setDeploymentContext({
      service: 'arremate-api',
      deploymentVersion: 'v1.2.3',
      gitSha: 'abc1234',
    });

    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackEvent(TelemetryEvents.AUTH_LOGIN_SUCCESS, { userId: 'user-42' });

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.service).toBe('arremate-api');
    expect(ctx.deploymentVersion).toBe('v1.2.3');
    expect(ctx.gitSha).toBe('abc1234');
    expect(ctx.userId).toBe('user-42');
  });

  it('omits undefined deployment context fields', () => {
    setDeploymentContext({ service: 'arremate-api' });

    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackEvent(TelemetryEvents.SECURITY_RATE_LIMIT_EXCEEDED);

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.service).toBe('arremate-api');
    expect('deploymentVersion' in ctx).toBe(false);
    expect('gitSha' in ctx).toBe(false);
  });

  it('payload fields override deployment context fields', () => {
    setDeploymentContext({ service: 'arremate-api' });

    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackEvent(TelemetryEvents.HTTP_REQUEST_COMPLETED, { service: 'custom-override' });

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.service).toBe('custom-override');
  });
});

// ─── trackMetric ──────────────────────────────────────────────────────────────

describe('trackMetric', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setDeploymentContext({ service: undefined, deploymentVersion: undefined, gitSha: undefined });
  });

  it('emits a structured log entry with metric and value fields', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackMetric('usage.request.count', 1);

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.metric).toBe('usage.request.count');
    expect(ctx.value).toBe(1);
  });

  it('includes provided dimensions in the log entry', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackMetric('usage.db.query.duration', 42.5, { model: 'order', operation: 'findMany' });

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.value).toBe(42.5);
    expect(ctx.model).toBe('order');
    expect(ctx.operation).toBe('findMany');
  });

  it('attaches deployment context fields when set', () => {
    setDeploymentContext({
      service: 'arremate-api',
      deploymentVersion: 'v2.0.0',
      gitSha: 'deadbeef',
    });

    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackMetric('usage.request.count', 1, { statusClass: '2xx' });

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.service).toBe('arremate-api');
    expect(ctx.deploymentVersion).toBe('v2.0.0');
    expect(ctx.gitSha).toBe('deadbeef');
    expect(ctx.statusClass).toBe('2xx');
  });

  it('omits undefined deployment context fields', () => {
    setDeploymentContext({ deploymentVersion: 'v1.0.0' });

    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackMetric('usage.request.count', 1);

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.deploymentVersion).toBe('v1.0.0');
    expect('service' in ctx).toBe(false);
    expect('gitSha' in ctx).toBe(false);
  });

  it('caller-supplied dimensions override deployment context values', () => {
    setDeploymentContext({ service: 'arremate-api' });

    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackMetric('usage.request.count', 1, { service: 'custom-service' });

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.service).toBe('custom-service');
  });
});

// ─── setDeploymentContext ─────────────────────────────────────────────────────

describe('setDeploymentContext', () => {
  beforeEach(() => {
    setDeploymentContext({ service: undefined, deploymentVersion: undefined, gitSha: undefined });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setDeploymentContext({ service: undefined, deploymentVersion: undefined, gitSha: undefined });
  });

  it('merges new fields with existing context', () => {
    setDeploymentContext({ service: 'arremate-api' });
    setDeploymentContext({ gitSha: 'abc123' });

    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    trackEvent(TelemetryEvents.AUTH_LOGIN_SUCCESS);

    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.service).toBe('arremate-api');
    expect(ctx.gitSha).toBe('abc123');
  });

  it('later calls override earlier values for the same key', () => {
    setDeploymentContext({ service: 'old-service' });
    setDeploymentContext({ service: 'new-service' });

    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    trackEvent(TelemetryEvents.AUTH_LOGIN_SUCCESS);

    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.service).toBe('new-service');
  });
});

// ─── TelemetryEvents taxonomy ─────────────────────────────────────────────────

describe('TelemetryEvents', () => {
  it('exposes canonical HTTP event names', () => {
    expect(TelemetryEvents.HTTP_REQUEST_COMPLETED).toBe('http.request.completed');
    expect(TelemetryEvents.HTTP_REQUEST_FAILED).toBe('http.request.failed');
    expect(TelemetryEvents.HTTP_REQUEST_CLIENT_ERROR).toBe('http.request.client_error');
  });

  it('exposes canonical auction event names', () => {
    expect(TelemetryEvents.AUCTION_BID_PLACED).toBe('auction.bid.placed');
    expect(TelemetryEvents.AUCTION_BID_REJECTED).toBe('auction.bid.rejected');
    expect(TelemetryEvents.AUCTION_LOT_CLAIMED).toBe('auction.lot.claimed');
    expect(TelemetryEvents.AUCTION_SESSION_STARTED).toBe('auction.session.started');
    expect(TelemetryEvents.AUCTION_SESSION_ENDED).toBe('auction.session.ended');
  });

  it('exposes canonical payment event names', () => {
    expect(TelemetryEvents.PAYMENT_CREATED).toBe('payment.created');
    expect(TelemetryEvents.PAYMENT_CREATION_FAILED).toBe('payment.creation.failed');
    expect(TelemetryEvents.PAYMENT_PAID).toBe('payment.paid');
    expect(TelemetryEvents.PAYMENT_EXPIRED).toBe('payment.expired');
    expect(TelemetryEvents.PAYMENT_REFUNDED).toBe('payment.refunded');
    expect(TelemetryEvents.PAYMENT_RECONCILED).toBe('payment.reconciled');
  });

  it('exposes canonical webhook event names', () => {
    expect(TelemetryEvents.WEBHOOK_RECEIVED).toBe('webhook.received');
    expect(TelemetryEvents.WEBHOOK_PROCESSED).toBe('webhook.processed');
    expect(TelemetryEvents.WEBHOOK_REJECTED).toBe('webhook.rejected');
    expect(TelemetryEvents.WEBHOOK_DUPLICATE).toBe('webhook.duplicate');
  });

  it('exposes canonical auth event names', () => {
    expect(TelemetryEvents.AUTH_LOGIN_SUCCESS).toBe('auth.login.success');
    expect(TelemetryEvents.AUTH_LOGIN_FAILED).toBe('auth.login.failed');
    expect(TelemetryEvents.AUTH_TOKEN_REFRESHED).toBe('auth.token.refreshed');
    expect(TelemetryEvents.AUTH_TOKEN_INVALID).toBe('auth.token.invalid');
    expect(TelemetryEvents.AUTH_ACCESS_DENIED).toBe('auth.access.denied');
  });

  it('exposes canonical security event names', () => {
    expect(TelemetryEvents.SECURITY_RATE_LIMIT_EXCEEDED).toBe('security.rate_limit.exceeded');
    expect(TelemetryEvents.SECURITY_INVALID_REQUEST).toBe('security.invalid_request');
    expect(TelemetryEvents.SECURITY_SUSPICIOUS_REQUEST).toBe('security.suspicious_request');
    expect(TelemetryEvents.SECURITY_ADMIN_ACTION).toBe('security.admin.action');
  });

  it('exposes the DB slow query event name', () => {
    expect(TelemetryEvents.DB_SLOW_QUERY).toBe('db.slow_query');
  });
});
