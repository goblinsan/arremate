import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();

/**
 * GET /v1/admin/health
 *
 * Detailed health check for ops tooling. Returns status of every critical
 * sub-system (database, payment provider, etc.).
 */
app.get('/v1/admin/health', authenticate, requireRole('ADMIN'), async (c) => {
  const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; detail?: string }> = {};

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

  const pixProvider = process.env.PIX_PROVIDER ?? 'stub';
  checks.paymentProvider = { status: 'ok', detail: pixProvider };

  const allOk = Object.values(checks).every((ch) => ch.status === 'ok');

  return c.json(
    {
      status: allOk ? 'ok' : 'degraded',
      service: 'arremate-api',
      timestamp: new Date().toISOString(),
      checks,
      env: process.env.NODE_ENV ?? 'development',
    },
    allOk ? 200 : 503,
  );
});

export { app as healthRoutes };
