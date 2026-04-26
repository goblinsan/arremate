import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

// Polyfill WebSocket for Node.js (not needed in CF Workers or Neon Edge)
if (typeof WebSocket === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  neonConfig.webSocketConstructor = require('ws');
}

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
        return (method as (...methodArgs: unknown[]) => unknown).apply(delegate, args);
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
