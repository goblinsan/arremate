import { describe, it, expect, vi, afterEach } from 'vitest';
import { emitMetric } from '../index.js';

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

// ─── emitMetric ───────────────────────────────────────────────────────────────

describe('emitMetric', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits a structured log entry with metric and value fields', () => {
    // In non-production (test) mode the logger uses console.info for 'info' level.
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    emitMetric('usage.request.count', 1);

    expect(spy).toHaveBeenCalledOnce();
    const logLine = spy.mock.calls[0][0] as string;
    expect(logLine).toContain('usage.metric');
    const ctx = parseDevLogContext(logLine);
    expect(ctx.metric).toBe('usage.request.count');
    expect(ctx.value).toBe(1);
  });

  it('includes provided dimensions in the log entry', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    emitMetric('usage.request.count', 1, {
      service: 'arremate-api',
      statusClass: '2xx',
      route: '/v1/orders',
    });

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.metric).toBe('usage.request.count');
    expect(ctx.service).toBe('arremate-api');
    expect(ctx.statusClass).toBe('2xx');
    expect(ctx.route).toBe('/v1/orders');
  });

  it('omits undefined dimension values from the log entry', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    emitMetric('usage.db.query.count', 1, { model: 'order', deploymentVersion: undefined });

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.model).toBe('order');
    // undefined values are stripped by JSON.stringify
    expect('deploymentVersion' in ctx).toBe(false);
  });

  it('supports non-integer values such as durations', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    emitMetric('usage.db.query.duration', 123.45, { model: 'user', operation: 'findUnique' });

    expect(spy).toHaveBeenCalledOnce();
    const ctx = parseDevLogContext(spy.mock.calls[0][0] as string);
    expect(ctx.value).toBe(123.45);
    expect(ctx.model).toBe('user');
    expect(ctx.operation).toBe('findUnique');
  });
});
