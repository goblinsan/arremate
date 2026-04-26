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

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient().prisma;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

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

export * from '@prisma/client';
