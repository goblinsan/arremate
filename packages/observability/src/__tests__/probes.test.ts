import { describe, it, expect, vi, afterEach } from 'vitest';
import { runProbe } from '../probes.js';
import {
  setDeploymentContext,
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

/** Fake fetch that resolves immediately with the given status code. */
function makeFakeFetch(status: number): typeof fetch {
  return async (_url, _init) => {
    return new Response(null, { status });
  };
}

/** Fake fetch that rejects with a network error. */
function makeFailingFetch(message: string): typeof fetch {
  return async (_url, _init) => {
    throw new Error(message);
  };
}

// ─── runProbe ─────────────────────────────────────────────────────────────────

describe('runProbe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setDeploymentContext({ service: undefined, deploymentVersion: undefined, gitSha: undefined });
  });

  it('returns ok=true and the HTTP status for a 200 response', async () => {
    const fetchFn = makeFakeFetch(200);
    const result = await runProbe('https://api.example.com/health', { label: 'health', fetchFn });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.label).toBe('health');
    expect(result.url).toBe('https://api.example.com/health');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('returns ok=false for a 503 response', async () => {
    const fetchFn = makeFakeFetch(503);
    const result = await runProbe('https://api.example.com/health', { label: 'health', fetchFn });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.error).toBeUndefined();
  });

  it('returns ok=false and captures the error message on network failure', async () => {
    const fetchFn = makeFailingFetch('connection refused');
    const result = await runProbe('https://api.example.com/health', { label: 'health', fetchFn });

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toBe('connection refused');
  });

  it('defaults the label to the URL when no label is provided', async () => {
    const fetchFn = makeFakeFetch(200);
    const result = await runProbe('https://api.example.com/ping', { fetchFn });

    expect(result.label).toBe('https://api.example.com/ping');
  });

  it('includes a valid ISO-8601 timestamp', async () => {
    const fetchFn = makeFakeFetch(200);
    const result = await runProbe('https://api.example.com/health', { label: 'health', fetchFn });

    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('emits a synthetic.probe.ok event for a successful probe', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchFn = makeFakeFetch(200);

    await runProbe('https://api.example.com/health', { label: 'health', fetchFn });

    const calls = spy.mock.calls.map((c) => c[0] as string);
    const eventCall = calls.find((line) => line.includes('synthetic.probe.ok'));
    expect(eventCall).toBeDefined();
    const ctx = parseDevLogContext(eventCall!);
    expect(ctx.event).toBe('synthetic.probe.ok');
    expect(ctx.label).toBe('health');
    expect(ctx.ok).toBe(true);
  });

  it('emits a synthetic.probe.error event for a failed probe', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchFn = makeFailingFetch('timeout');

    await runProbe('https://api.example.com/health', { label: 'health', fetchFn });

    const calls = spy.mock.calls.map((c) => c[0] as string);
    const eventCall = calls.find((line) => line.includes('synthetic.probe.error'));
    expect(eventCall).toBeDefined();
    const ctx = parseDevLogContext(eventCall!);
    expect(ctx.event).toBe('synthetic.probe.error');
    expect(ctx.ok).toBe(false);
    expect(ctx.error).toBe('timeout');
  });

  it('emits synthetic.probe.latency_ms and synthetic.probe.up metrics', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchFn = makeFakeFetch(200);

    await runProbe('https://api.example.com/health', { label: 'health', fetchFn });

    const calls = spy.mock.calls.map((c) => c[0] as string);

    const latencyCall = calls.find((line) => line.includes('synthetic.probe.latency_ms'));
    expect(latencyCall).toBeDefined();
    const latencyCtx = parseDevLogContext(latencyCall!);
    expect(latencyCtx.metric).toBe('synthetic.probe.latency_ms');
    expect(latencyCtx.label).toBe('health');

    const upCall = calls.find((line) => line.includes('synthetic.probe.up'));
    expect(upCall).toBeDefined();
    const upCtx = parseDevLogContext(upCall!);
    expect(upCtx.metric).toBe('synthetic.probe.up');
    expect(upCtx.value).toBe(1);
  });

  it('emits synthetic.probe.up=0 when the probe fails', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchFn = makeFailingFetch('network error');

    await runProbe('https://api.example.com/health', { label: 'health', fetchFn });

    const calls = spy.mock.calls.map((c) => c[0] as string);
    const upCall = calls.find((line) => line.includes('synthetic.probe.up'));
    expect(upCall).toBeDefined();
    const upCtx = parseDevLogContext(upCall!);
    expect(upCtx.value).toBe(0);
  });
});
