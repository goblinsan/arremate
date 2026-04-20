import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';

/**
 * Chat routes for live session messaging.
 *
 * GET  /v1/sessions/:sessionId/chat  – list recent messages (public)
 * POST /v1/sessions/:sessionId/chat  – send a message (authenticated, rate-limited)
 */

const MAX_MESSAGE_LENGTH = 300;
const MIN_MESSAGE_LENGTH = 1;
const RATE_LIMIT_WINDOW_MS = 2000; // 1 message per 2 seconds per user per session
const CHAT_PAGE_SIZE = 50;

// Simple in-memory rate limiter: key = `${userId}:${sessionId}` → last message timestamp
const lastMessageAt = new Map<string, number>();

// Basic moderation: list of flagged patterns.
// This is intentionally minimal; extend or replace with a proper moderation
// service (e.g. perspective API) as the platform grows.
const FLAGGED_PATTERNS = [/\b(spam)\b/i];

function getModerationStatus(content: string): 'APPROVED' | 'FLAGGED' {
  for (const pattern of FLAGGED_PATTERNS) {
    if (pattern.test(content)) return 'FLAGGED';
  }
  return 'APPROVED';
}

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── List messages (public) ──────────────────────────────────────────────────
  fastify.get('/v1/sessions/:sessionId/chat', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { before, limit } = request.query as { before?: string; limit?: string };

    const session = await prisma.showSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true },
    });

    if (!session) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });
    }

    const take = Math.min(Number(limit ?? CHAT_PAGE_SIZE), CHAT_PAGE_SIZE);

    const messages = await prisma.chatMessage.findMany({
      where: {
        sessionId,
        moderationStatus: { not: 'REMOVED' },
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        sessionId: true,
        userId: true,
        content: true,
        moderationStatus: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    });

    return reply.send(messages.reverse());
  });

  // ─── Send message (authenticated) ────────────────────────────────────────────
  fastify.post(
    '/v1/sessions/:sessionId/chat',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;
      const { sessionId } = request.params as { sessionId: string };
      const { content } = request.body as { content?: string };

      // Validate content
      if (typeof content !== 'string' || content.trim().length < MIN_MESSAGE_LENGTH) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Message content is required',
        });
      }

      if (content.trim().length > MAX_MESSAGE_LENGTH) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
        });
      }

      // Verify session exists and is LIVE
      const session = await prisma.showSession.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true },
      });

      if (!session) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });
      }

      if (session.status !== 'LIVE') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Chat is only available during a LIVE session',
        });
      }

      // Rate limiting
      const rateLimitKey = `${user.id}:${sessionId}`;
      const lastSent = lastMessageAt.get(rateLimitKey) ?? 0;
      const now = Date.now();

      if (now - lastSent < RATE_LIMIT_WINDOW_MS) {
        return reply.status(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'You are sending messages too quickly. Please wait a moment.',
        });
      }

      lastMessageAt.set(rateLimitKey, now);

      const trimmedContent = content.trim();
      const moderationStatus = getModerationStatus(trimmedContent);

      const message = await prisma.chatMessage.create({
        data: {
          sessionId,
          userId: user.id,
          content: trimmedContent,
          moderationStatus,
        },
        select: {
          id: true,
          sessionId: true,
          userId: true,
          content: true,
          moderationStatus: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      });

      return reply.status(201).send(message);
    },
  );
}
