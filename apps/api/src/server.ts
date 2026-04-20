import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { randomUUID } from 'crypto';
import { captureException } from '@arremate/observability';
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
import { healthRoutes } from './routes/health.js';

// ─── Sentry initialisation (optional – only active when SENTRY_DSN is set) ──
// To enable: install @sentry/node, set SENTRY_DSN, and uncomment the block.
//
// import * as Sentry from '@sentry/node';
// import { setErrorReporter } from '@arremate/observability';
// if (process.env.SENTRY_DSN) {
//   Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
//   setErrorReporter((err, ctx) => Sentry.captureException(err, { extra: ctx }));
// }

const server = Fastify({
  // Fastify uses Pino which emits structured JSON by default – ideal for
  // production log aggregation.  The request ID is automatically included in
  // every log line, providing correlation across log entries for a single
  // request.
  logger: true,
  // Expose the request ID in the response header for client-side correlation.
  requestIdHeader: 'x-request-id',
  genReqId: (req) => req.headers['x-request-id']?.toString() ?? randomUUID(),
});

// ─── Global unhandled-error capture ─────────────────────────────────────────
server.setErrorHandler((error, request, reply) => {
  captureException(error, { requestId: request.id, url: request.url, method: request.method });
  request.log.error({ err: error, requestId: request.id }, 'Unhandled request error');
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  reply.status(statusCode).send({
    statusCode,
    error: error.name ?? 'Internal Server Error',
    message: statusCode < 500 ? error.message : 'An unexpected error occurred',
  });
});

server.register(cors, { origin: process.env.CORS_ORIGIN ?? '*' });
server.register(helmet);

// ─── Public health check (liveness probe) ───────────────────────────────────
server.get('/health', async () => {
  return { status: 'ok', service: 'arremate-api', timestamp: new Date().toISOString() };
});

server.get('/api/v1/ping', async () => ({ pong: true }));

// Auth routes
server.register(meRoutes);

// Seller onboarding routes
server.register(sellerApplicationRoutes);
server.register(adminSellerApplicationRoutes);

// Show & inventory routes
server.register(sellerShowRoutes);
server.register(sellerInventoryRoutes);
server.register(showQueueRoutes);

// Public routes
server.register(publicShowRoutes);

// Live session routes
server.register(liveSessionRoutes);

// Chat routes
server.register(chatRoutes);

// Claims
server.register(claimRoutes);

// Orders & payments
server.register(orderRoutes);

// Fulfillment & support
server.register(fulfillmentRoutes);

// Webhooks
server.register(webhookRoutes);

// Disputes & moderation
server.register(adminDisputeRoutes);
server.register(adminModerationRoutes);
server.register(adminRefundRoutes);
server.register(adminAuditRoutes);

// Health & observability
server.register(healthRoutes);

const start = async () => {
  try {
    const port = Number(process.env.PORT ?? 4000);
    await server.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

export { server };
