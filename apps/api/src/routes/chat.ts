import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const MAX_MESSAGE_LENGTH = 300;
const MIN_MESSAGE_LENGTH = 1;
const RATE_LIMIT_WINDOW_MS = 2000;
const CHAT_PAGE_SIZE = 50;
const lastMessageAt = new Map<string, number>();
const FLAGGED_PATTERNS = [/\b(spam)\b/i];

function getModerationStatus(content: string): 'APPROVED' | 'FLAGGED' {
  for (const pattern of FLAGGED_PATTERNS) {
    if (pattern.test(content)) return 'FLAGGED';
  }
  return 'APPROVED';
}

app.get('/v1/sessions/:sessionId/chat', async (c) => {
  const sessionId = c.req.param('sessionId');
  const before = c.req.query('before');
  const limit = c.req.query('limit');
  const session = await prisma.showSession.findUnique({ where: { id: sessionId }, select: { id: true, status: true } });
  if (!session) return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  const take = Math.min(Number(limit ?? CHAT_PAGE_SIZE), CHAT_PAGE_SIZE);
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId, moderationStatus: { not: 'REMOVED' }, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, sessionId: true, userId: true, content: true, moderationStatus: true, createdAt: true, user: { select: { id: true, name: true } } },
  });
  return c.json(messages.reverse());
});

app.post('/v1/sessions/:sessionId/chat', authenticate, async (c) => {
  const user = c.get('currentUser');
  const sessionId = c.req.param('sessionId');
  const { content } = await c.req.json<{ content?: string }>();

  if (typeof content !== 'string' || content.trim().length < MIN_MESSAGE_LENGTH) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'Message content is required' }, 400);
  }
  if (content.trim().length > MAX_MESSAGE_LENGTH) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters` }, 400);
  }

  const session = await prisma.showSession.findUnique({ where: { id: sessionId }, select: { id: true, status: true } });
  if (!session) return c.json({ statusCode: 404, error: 'Not Found', message: 'Session not found' }, 404);
  if (session.status !== 'LIVE') return c.json({ statusCode: 409, error: 'Conflict', message: 'Chat is only available during a LIVE session' }, 409);

  const rateLimitKey = `${user.id}:${sessionId}`;
  const last = lastMessageAt.get(rateLimitKey) ?? 0;
  if (Date.now() - last < RATE_LIMIT_WINDOW_MS) {
    return c.json({ statusCode: 429, error: 'Too Many Requests', message: 'Please wait before sending another message' }, 429);
  }
  lastMessageAt.set(rateLimitKey, Date.now());

  const moderationStatus = getModerationStatus(content.trim());
  const message = await prisma.chatMessage.create({
    data: { sessionId, userId: user.id, content: content.trim(), moderationStatus },
    select: { id: true, sessionId: true, userId: true, content: true, moderationStatus: true, createdAt: true, user: { select: { id: true, name: true } } },
  });
  return c.json(message, 201);
});

export { app as chatRoutes };
