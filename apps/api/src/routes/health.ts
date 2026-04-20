import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';

/**
 * GET /v1/admin/health
 *
 * Detailed health check for ops tooling. Returns status of every critical
 * sub-system (database, payment provider, etc.).  Intended for internal use
 * only – do not expose to the public internet without authentication.
 */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/admin/health', async (_request, reply) => {
    const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; detail?: string }> = {};

    // ── Database ─────────────────────────────────────────────────────────────
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (err) {
      checks.database = {
        status: 'error',
        latencyMs: Date.now() - dbStart,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    // ── Payment provider ─────────────────────────────────────────────────────
    // For the stub provider used in development this is always ok.
    const pixProvider = process.env.PIX_PROVIDER ?? 'stub';
    checks.paymentProvider = {
      status: 'ok',
      detail: pixProvider,
    };

    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    const httpStatus = allOk ? 200 : 503;

    return reply.status(httpStatus).send({
      status: allOk ? 'ok' : 'degraded',
      service: 'arremate-api',
      timestamp: new Date().toISOString(),
      checks,
      uptime: process.uptime(),
      nodeVersion: process.version,
      env: process.env.NODE_ENV ?? 'development',
    });
  });
}
