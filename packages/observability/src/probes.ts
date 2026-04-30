import { trackEvent, trackMetric } from './index.js';
import { TelemetryEvents } from './events.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The result produced by a single synthetic probe run. */
export interface ProbeResult {
  /** The URL that was probed. */
  url: string;
  /** The human-readable label for this probe. */
  label: string;
  /** HTTP status code, or `null` when a network/timeout error occurred. */
  status: number | null;
  /** `true` when the response has a 2xx status code. */
  ok: boolean;
  /** Round-trip latency from request dispatch to response in milliseconds. */
  latencyMs: number;
  /** ISO-8601 timestamp at which the probe was dispatched. */
  timestamp: string;
  /** Error message when the request could not be completed. */
  error?: string;
}

/** Options accepted by {@link runProbe}. */
export interface ProbeOptions {
  /**
   * Human-readable label for this probe used in metric dimensions and log
   * entries.  Defaults to the raw URL when not supplied.
   */
  label?: string;
  /**
   * Fetch implementation to use.  Override in tests to avoid real network
   * calls.  Defaults to the global `fetch`.
   */
  fetchFn?: typeof fetch;
  /**
   * Request timeout in milliseconds.  The probe is aborted and counted as an
   * error when no response is received within this window.
   * Defaults to `10_000` (10 seconds).
   */
  timeoutMs?: number;
}

// ─── runProbe ─────────────────────────────────────────────────────────────────

/**
 * Execute a single synthetic probe against the given URL.
 *
 * The probe issues a GET request, measures round-trip latency, and emits two
 * telemetry records via {@link trackEvent} and {@link trackMetric}:
 *
 * - `synthetic.probe.ok` / `synthetic.probe.error` – structured event with
 *   url, label, status, latencyMs, and timestamp fields.
 * - `synthetic.probe.latency_ms` – latency gauge keyed by `label`.
 * - `synthetic.probe.up` – availability gauge: `1` when OK, `0` on failure.
 *
 * The function **never throws**; network and timeout errors are captured into
 * the returned {@link ProbeResult} so callers can run many probes with
 * `Promise.allSettled` without losing results.
 *
 * @param url     Target URL to GET.
 * @param options Optional configuration (label, fetchFn, timeoutMs).
 * @returns       A {@link ProbeResult} describing the outcome.
 *
 * @example
 * const result = await runProbe('https://api.arrematelive.com/health', { label: 'health' });
 * console.log(result.ok, result.latencyMs);
 */
export async function runProbe(url: string, options?: ProbeOptions): Promise<ProbeResult> {
  const label = options?.label ?? url;
  const fetchFn = options?.fetchFn ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 10_000;

  const timestamp = new Date().toISOString();
  const startedAt = Date.now();

  let status: number | null = null;
  let ok = false;
  let error: string | undefined;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, { signal: controller.signal });
    status = response.status;
    ok = response.ok;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    ok = false;
  } finally {
    clearTimeout(timeoutId);
  }

  const latencyMs = Date.now() - startedAt;

  const result: ProbeResult = { url, label, status, ok, latencyMs, timestamp };
  if (error !== undefined) {
    result.error = error;
  }

  // ── Emit structured telemetry ────────────────────────────────────────────
  trackEvent(ok ? TelemetryEvents.PROBE_OK : TelemetryEvents.PROBE_ERROR, {
    url,
    label,
    status,
    ok,
    latencyMs,
    timestamp,
    ...(error !== undefined ? { error } : {}),
  });

  trackMetric('synthetic.probe.latency_ms', latencyMs, { label });
  trackMetric('synthetic.probe.up', ok ? 1 : 0, { label });

  return result;
}
