import { Hono } from 'hono';
import { authenticate } from '../plugins/authenticate.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();

/**
 * GET /v1/me
 *
 * Returns the local User record and role for the currently authenticated user.
 * Requires a valid Cognito access token in the Authorization header.
 */
app.get('/v1/me', authenticate, (c) => {
  const user = c.get('currentUser');
  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

export { app as meRoutes };
