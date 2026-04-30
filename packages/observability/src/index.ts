export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface MetricDimensions {
  [key: string]: string | number | boolean | undefined;
}

export interface LogContext {
  [key: string]: unknown;
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
