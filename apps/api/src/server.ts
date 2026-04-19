import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { meRoutes } from './routes/me.js';
import { sellerApplicationRoutes } from './routes/seller-applications.js';
import { adminSellerApplicationRoutes } from './routes/admin-seller-applications.js';

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
