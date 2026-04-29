import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { randomUUID } from 'crypto';
import { captureException, logger } from '@arremate/observability';
import { meRoutes } from './routes/me.js';
import { sellerApplicationRoutes } from './routes/seller-applications.js';
import { adminSellerApplicationRoutes } from './routes/admin-seller-applications.js';
import { sellerShowRoutes } from './routes/seller-shows.js';
import { sellerInventoryRoutes } from './routes/seller-inventory.js';
import { showQueueRoutes } from './routes/show-queue.js';
import { publicShowRoutes } from './routes/public-shows.js';
import { liveSessionRoutes } from './routes/live-session.js';
import { chatRoutes } from './routes/chat.js';
import { claimRoutes } from './routes/claims.js';
import { orderRoutes } from './routes/orders.js';
import { fulfillmentRoutes } from './routes/fulfillment.js';
import { webhookRoutes } from './routes/webhooks.js';
import { adminDisputeRoutes } from './routes/admin-disputes.js';
import { adminModerationRoutes } from './routes/admin-moderation.js';
import { adminRefundRoutes } from './routes/admin-refunds.js';
import { adminAuditRoutes } from './routes/admin-audit.js';
import { adminFeeConfigRoutes } from './routes/admin-fee-configs.js';
import { adminOrderRoutes } from './routes/admin-orders.js';
import { adminAnalyticsRoutes } from './routes/admin-analytics.js';
import { adminReconciliationRoutes } from './routes/admin-reconciliation.js';
import { healthRoutes } from './routes/health.js';
import type { AppEnv } from './types.js';

export const app = new Hono<AppEnv>();

const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOrigin = configuredOrigins.length > 0
  ? (origin: string) => {
      if (!origin) return configuredOrigins[0];
      return configuredOrigins.includes(origin) ? origin : null;
    }
  : (process.env.CORS_ORIGIN ?? '*');

function resolveErrorCorsOrigin(requestOrigin: string | undefined): string | null {
  if (typeof corsOrigin === 'function') {
    return corsOrigin(requestOrigin ?? '');
  }

  if (!corsOrigin) return null;
  return corsOrigin;
}

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use('*', cors({ origin: corsOrigin, allowHeaders: ['Authorization', 'Content-Type'] }));
app.use('*', secureHeaders());

// ─── Request-ID propagation ──────────────────────────────────────────────────
app.use('*', async (c, next) => {
  const reqId = c.req.header('x-request-id') ?? randomUUID();
  c.header('x-request-id', reqId);
  await next();
});

// ─── Request lifecycle telemetry ────────────────────────────────────────────
app.use('*', async (c, next) => {
  const startedAt = Date.now();

  await next();

  const elapsedMs = Date.now() - startedAt;
  const method = c.req.method;
  const pathname = new URL(c.req.url).pathname;
  const status = c.res.status;
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

  const context = {
    event: 'http.request.completed',
    requestId: c.res.headers.get('x-request-id') ?? c.req.header('x-request-id') ?? 'unknown',
    method,
    path: pathname,
    status,
    elapsedMs,
    origin: c.req.header('origin') ?? null,
    cfRay: c.req.header('cf-ray') ?? null,
    hasAuthorization: !!c.req.header('authorization'),
  };

  if (level === 'error') {
    logger.error('http request failed', undefined, context);
  } else if (level === 'warn') {
    logger.warn('http request warning', context);
  } else {
    logger.info('http request', context);
  }
});

// ─── Global error handler ────────────────────────────────────────────────────
app.onError((err, c) => {
  captureException(err, {
    url: c.req.url,
    method: c.req.method,
    requestId: c.req.header('x-request-id') ?? 'unknown',
    origin: c.req.header('origin') ?? null,
    cfRay: c.req.header('cf-ray') ?? null,
  });

  const requestOrigin = c.req.header('origin');
  const allowedOrigin = resolveErrorCorsOrigin(requestOrigin);
  if (allowedOrigin) {
    c.header('access-control-allow-origin', allowedOrigin);
    c.header('vary', 'Origin');
  }

  const e = err as Error & { statusCode?: number; status?: number };
  const statusCode = e.statusCode ?? e.status ?? 500;
  return c.json({
    statusCode,
    error: e.name ?? 'Internal Server Error',
    message: statusCode < 500 ? e.message : 'An unexpected error occurred',
  }, statusCode as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503);
});

// ─── Public health / ping ────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', service: 'arremate-api', timestamp: new Date().toISOString() }));
app.get('/api/v1/ping', (c) => c.json({ pong: true }));

// ─── Route registration ──────────────────────────────────────────────────────
app.route('/', meRoutes);
app.route('/', sellerApplicationRoutes);
app.route('/', adminSellerApplicationRoutes);
app.route('/', sellerShowRoutes);
app.route('/', sellerInventoryRoutes);
app.route('/', showQueueRoutes);
app.route('/', publicShowRoutes);
app.route('/', liveSessionRoutes);
app.route('/', chatRoutes);
app.route('/', claimRoutes);
app.route('/', orderRoutes);
app.route('/', fulfillmentRoutes);
app.route('/', webhookRoutes);
app.route('/', adminDisputeRoutes);
app.route('/', adminModerationRoutes);
app.route('/', adminRefundRoutes);
app.route('/', adminAuditRoutes);
app.route('/', adminFeeConfigRoutes);
app.route('/', adminOrderRoutes);
app.route('/', adminAnalyticsRoutes);
app.route('/', adminReconciliationRoutes);
app.route('/', healthRoutes);
