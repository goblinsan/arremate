import { runProbe } from '@arremate/observability';

/**
 * Origin of the API to probe.
 *
 * Set `SYNTHETIC_PROBE_ORIGIN` in the environment to point probes at the
 * correct deployment.  Defaults to `http://localhost:4000` for local runs.
 *
 * `process.env` is available in this Workers deployment because
 * `nodejs_compat_populate_process_env` is set in wrangler.toml, consistent
 * with how environment variables are accessed throughout this codebase.
 *
 * @example
 * # production
 * SYNTHETIC_PROBE_ORIGIN=https://api.arrematelive.com
 * # staging
 * SYNTHETIC_PROBE_ORIGIN=https://arremate-api-staging.<account>.workers.dev
 */
const API_ORIGIN = (process.env.SYNTHETIC_PROBE_ORIGIN ?? 'http://localhost:4000').replace(/\/$/, '');

/**
 * Critical API endpoints to validate on every synthetic probe run.
 *
 * Each entry maps a human-readable `label` to the `path` that will be probed.
 * Labels are used as metric dimensions, so keep them short and stable.
 *
 * Coverage:
 * - `health`       – public liveness endpoint; database reachability indicator
 * - `ping`         – lightweight round-trip check (no DB)
 * - `shows.list`   – auction domain; exercises the public show-listing query
 */
const PROBE_TARGETS: Array<{ label: string; path: string }> = [
  { label: 'health', path: '/health' },
  { label: 'ping', path: '/api/v1/ping' },
  { label: 'shows.list', path: '/v1/shows' },
];

/**
 * Run all configured synthetic probes concurrently.
 *
 * Results are collected with `Promise.allSettled` so a single probe failure
 * never prevents the remaining probes from executing.  All outcomes are
 * emitted as structured telemetry by {@link runProbe} before this function
 * returns.
 */
export async function runProbes(): Promise<void> {
  await Promise.allSettled(
    PROBE_TARGETS.map(({ label, path }) =>
      runProbe(`${API_ORIGIN}${path}`, { label }),
    ),
  );
}
