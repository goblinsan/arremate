import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import { emitMetric, logger } from '@arremate/observability';

// Polyfill WebSocket for Node.js (not needed in CF Workers or Neon Edge)
if (typeof WebSocket === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  neonConfig.webSocketConstructor = require('ws');
}

/**
 * Latency threshold in milliseconds above which a database query is
 * considered slow and triggers a warning-level log entry suitable for
 * alert rule ingestion.
 */
const SLOW_QUERY_THRESHOLD_MS = 500;

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaNeon(pool);
  const prisma = new PrismaClient({ adapter });

  return {
    prisma,
    dispose: async () => {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}

/**
 * Executes a database operation with a request-scoped Prisma client.
 *
 * This avoids cross-request I/O reuse issues in edge runtimes by ensuring
 * each operation has isolated DB adapter/pool resources.
 */
export async function withPrisma<T>(operation: (client: PrismaClient) => Promise<T>): Promise<T> {
  const { prisma: requestPrisma, dispose } = createPrismaClient();
  try {
    return await operation(requestPrisma);
  } finally {
    await dispose();
  }
}

type PrismaDelegate = Record<string, unknown>;

function createDelegateProxy(delegateName: string): PrismaDelegate {
  return new Proxy({}, {
    get(_target, delegateMethod) {
      if (delegateMethod === 'then') return undefined;

      return (...args: unknown[]) => withPrisma(async (client) => {
        const delegate = (client as unknown as Record<string, unknown>)[delegateName] as PrismaDelegate | undefined;
        const method = delegate?.[String(delegateMethod)];
        if (typeof method !== 'function') {
          throw new Error(`Prisma delegate method not found: ${delegateName}.${String(delegateMethod)}`);
        }

        const startedAt = Date.now();
        const dimensions = { model: delegateName, operation: String(delegateMethod) };

        try {
          const result = await (method as (...methodArgs: unknown[]) => unknown).apply(delegate, args);
          const elapsedMs = Date.now() - startedAt;

          emitMetric('usage.db.query.count', 1, dimensions);
          emitMetric('usage.db.query.duration', elapsedMs, dimensions);

          if (elapsedMs >= SLOW_QUERY_THRESHOLD_MS) {
            logger.warn('slow database query', {
              event: 'db.slow_query',
              ...dimensions,
              elapsedMs,
              thresholdMs: SLOW_QUERY_THRESHOLD_MS,
            });
          }

          return result;
        } catch (err) {
          const elapsedMs = Date.now() - startedAt;

          emitMetric('usage.db.query.count', 1, { ...dimensions, error: 'true' });
          emitMetric('usage.db.query.duration', elapsedMs, { ...dimensions, error: 'true' });

          throw err;
        }
      });
    },
  });
}

/**
 * Backward-compatible Prisma export that keeps existing `prisma.model.method(...)`
 * call sites unchanged while executing each operation with request-scoped DB I/O.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (prop === 'then') return undefined;

    if (typeof prop === 'string' && !prop.startsWith('$')) {
      return createDelegateProxy(prop);
    }

    return (...args: unknown[]) => withPrisma(async (client) => {
      const member = (client as unknown as Record<string, unknown>)[String(prop)];
      if (typeof member !== 'function') {
        throw new Error(`Prisma client method not found: ${String(prop)}`);
      }
      return (member as (...methodArgs: unknown[]) => unknown).apply(client, args);
    });
  },
});

export * from '@prisma/client';
