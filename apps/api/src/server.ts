import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
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
import { webhookRoutes } from './routes/webhooks.js';

const server = Fastify({ logger: true });

server.register(cors, { origin: process.env.CORS_ORIGIN ?? '*' });
server.register(helmet);

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

// Webhooks
server.register(webhookRoutes);

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
