type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const ts = new Date().toISOString();
  const ctx = context ? ` ${JSON.stringify(context)}` : '';
  return `[${ts}] [${level.toUpperCase()}] ${message}${ctx}`;
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatMessage('debug', message, context));
    }
  },
  info(message: string, context?: LogContext): void {
    console.info(formatMessage('info', message, context));
  },
  warn(message: string, context?: LogContext): void {
    console.warn(formatMessage('warn', message, context));
  },
  error(message: string, error?: unknown, context?: LogContext): void {
    const err = error instanceof Error ? { message: error.message, stack: error.stack } : error;
    console.error(formatMessage('error', message, { ...context, err }));
  },
};

export type { LogLevel, LogContext };
