export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ─── Synthetic probes ─────────────────────────────────────────────────────────
export { runProbe } from './probes.js';
export type { ProbeResult, ProbeOptions } from './probes.js';

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface MetricDimensions {
  [key: string]: string | number | boolean | undefined;
}

export interface LogContext {
  [key: string]: unknown;
}

// ─── Event taxonomy re-export ─────────────────────────────────────────────────

export { TelemetryEvents } from './events.js';
export type { TelemetryEventName } from './events.js';

// ─── Deployment context ───────────────────────────────────────────────────────

export interface DeploymentContext {
  /** Logical service name (e.g. `arremate-api`, `arremate-worker`). */
  service?: string;
  /** Human-readable deployment version tag (e.g. a SemVer or release label). */
  deploymentVersion?: string;
  /** Git commit SHA for the running build. */
  gitSha?: string;
}

let _deploymentContext: DeploymentContext = {};

/**
 * Configure deployment metadata that will be automatically attached to every
 * {@link trackEvent} and {@link trackMetric} record.
 *
 * Call this **once** at application startup (before any telemetry is emitted)
 * and do not call it again at runtime.  Concurrent writes are not synchronised;
 * calling this function after startup may produce inconsistent records.
 *
 * @example
 * setDeploymentContext({
 *   service: 'arremate-api',
 *   deploymentVersion: process.env.DEPLOY_VERSION,
 *   gitSha: process.env.GIT_SHA,
 * });
 */
export function setDeploymentContext(ctx: DeploymentContext): void {
  _deploymentContext = { ..._deploymentContext, ...ctx };
}

/** @internal */
function getDeploymentFields(): MetricDimensions {
  const fields: MetricDimensions = {};
  if (_deploymentContext.service !== undefined) {
    fields.service = _deploymentContext.service;
  }
  if (_deploymentContext.deploymentVersion !== undefined) {
    fields.deploymentVersion = _deploymentContext.deploymentVersion;
  }
  if (_deploymentContext.gitSha !== undefined) {
    fields.gitSha = _deploymentContext.gitSha;
  }
  return fields;
}

/** Replaceable error reporter. Set via {@link setErrorReporter}. */
type ErrorReporter = (error: unknown, context?: LogContext) => void;

let _errorReporter: ErrorReporter | null = null;

/**
 * Register a custom error reporter (e.g. Sentry.captureException).
 * Must be called before the first {@link captureException} invocation.
 *
 * @example
 * import * as Sentry from '@sentry/node';
 * setErrorReporter((err, ctx) => Sentry.captureException(err, { extra: ctx }));
 */
export function setErrorReporter(fn: ErrorReporter): void {
  _errorReporter = fn;
}

const isProduction =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ===
  'production';

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (isProduction) {
    // Newline-delimited JSON for log aggregation pipelines (e.g. CloudWatch, Datadog, Loki).
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...context,
    };
    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  } else {
    const ts = new Date().toISOString();
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    const line = `[${ts}] [${level.toUpperCase()}] ${message}${ctx}`;
    switch (level) {
      case 'debug': console.debug(line); break;
      case 'info':  console.info(line);  break;
      case 'warn':  console.warn(line);  break;
      case 'error': console.error(line); break;
    }
  }
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (!isProduction) {
      emit('debug', message, context);
    }
  },
  info(message: string, context?: LogContext): void {
    emit('info', message, context);
  },
  warn(message: string, context?: LogContext): void {
    emit('warn', message, context);
  },
  error(message: string, error?: unknown, context?: LogContext): void {
    const err =
      error instanceof Error
        ? { message: error.message, stack: error.stack, name: error.name }
        : error !== undefined
          ? { raw: error }
          : undefined;
    emit('error', message, err ? { ...context, err } : context);
    // Forward to the configured error reporter (e.g. Sentry) when set.
    if (error !== undefined && _errorReporter) {
      try {
        _errorReporter(error, context);
      } catch {
        // Never let the reporter crash the application.
      }
    }
  },
};

/**
 * Report an exception to the configured error reporter (if any) and to the
 * structured logger.  Falls back to a structured `console.error` call when no
 * reporter has been registered (e.g. during local development or tests).
 */
export function captureException(error: unknown, context?: LogContext): void {
  if (_errorReporter) {
    try {
      _errorReporter(error, context);
    } catch {
      // Never let the reporter crash the application.
    }
    return;
  }
  // Fallback: emit a structured log entry so errors are never silently swallowed.
  const err =
    error instanceof Error
      ? { message: error.message, stack: error.stack, name: error.name }
      : { raw: String(error) };
  emit('error', 'captureException', { ...context, err });
}

/**
 * Emit a counter or gauge metric as a structured log event.
 *
 * Metric entries are distinguishable from regular log entries by the presence
 * of the `metric` and `value` fields.  Any log aggregation pipeline (e.g.
 * CloudWatch Metric Filters, Datadog log-based metrics, Grafana Loki rules)
 * can parse these entries to build counters, gauges, and alert conditions.
 *
 * @param name       Dot-separated metric name, e.g. `usage.request.count`.
 * @param value      Numeric value for the metric (counter increment, gauge reading, duration, …).
 * @param dimensions Optional key/value tags that annotate the measurement.
 *
 * @example
 * emitMetric('usage.request.count', 1, { service: 'arremate-api', statusClass: '2xx' });
 */
export function emitMetric(name: string, value: number, dimensions?: MetricDimensions): void {
  emit('info', 'usage.metric', {
    metric: name,
    value,
    ...dimensions,
  });
}

// ─── trackMetric ──────────────────────────────────────────────────────────────

/**
 * Emit a structured metric record with an automatic timestamp and deployment
 * metadata attached.
 *
 * This is the preferred high-level helper for emitting numeric measurements.
 * It behaves like {@link emitMetric} but also includes the deployment context
 * (service, deploymentVersion, gitSha) registered via
 * {@link setDeploymentContext} so that every metric record is self-describing.
 *
 * @param name       Dot-separated metric name, e.g. `usage.request.count`.
 * @param value      Numeric value (counter increment, gauge, duration, …).
 * @param dimensions Optional key/value tags that annotate the measurement.
 *
 * @example
 * trackMetric('usage.request.count', 1, { route: '/v1/orders', statusClass: '2xx' });
 */
export function trackMetric(name: string, value: number, dimensions?: MetricDimensions): void {
  emit('info', 'usage.metric', {
    metric: name,
    value,
    ...getDeploymentFields(),
    ...dimensions,
  });
}

// ─── trackEvent ───────────────────────────────────────────────────────────────

export interface EventPayload {
  [key: string]: unknown;
}

/**
 * Emit a structured domain event record with an automatic timestamp and
 * deployment metadata attached.
 *
 * Use this helper to record meaningful business events (e.g. a bid placed, a
 * payment confirmed, an auth failure).  The emitted record includes:
 * - `event`   – the canonical event name (use {@link TelemetryEvents} constants)
 * - `ts`      – ISO-8601 timestamp (always present, even in dev mode)
 * - `service`, `deploymentVersion`, `gitSha` – from {@link setDeploymentContext}
 * - …any additional fields supplied in `payload`
 *
 * @param name    Canonical event name (e.g. `TelemetryEvents.PAYMENT_PAID`).
 * @param payload Optional key/value context for the event.
 *
 * @example
 * trackEvent(TelemetryEvents.PAYMENT_PAID, { orderId, amountCents, provider: 'efipay' });
 */
export function trackEvent(name: string, payload?: EventPayload): void {
  emit('info', name, {
    event: name,
    ts: new Date().toISOString(),
    ...getDeploymentFields(),
    ...payload,
  });
}

/**
 * Create a child logger that automatically includes the given base context in
 * every log entry.  Useful for adding a `requestId` or `service` tag once and
 * propagating it through all subsequent calls.
 */
export function createLogger(baseContext: LogContext) {
  return {
    debug(message: string, context?: LogContext): void {
      logger.debug(message, { ...baseContext, ...context });
    },
    info(message: string, context?: LogContext): void {
      logger.info(message, { ...baseContext, ...context });
    },
    warn(message: string, context?: LogContext): void {
      logger.warn(message, { ...baseContext, ...context });
    },
    error(message: string, error?: unknown, context?: LogContext): void {
      logger.error(message, error, { ...baseContext, ...context });
    },
  };
}
