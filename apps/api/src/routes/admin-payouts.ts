import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { generatePayoutBatch } from '../services/payout-service.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

// ─── GET /v1/admin/payout-batches ────────────────────────────────────────────
//
// List payout batches (most recent first).
// Query params:
//   status  — PENDING | PROCESSING | PAID | FAILED
//   page    — (default: 1)
//   perPage — (default: 30, max: 100)

app.get('/v1/admin/payout-batches', ...adminGuard, async (c) => {
  const pageNum = Math.max(1, Number(c.req.query('page') ?? '1'));
  const take = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '30')));
  const skip = (pageNum - 1) * take;
  const statusParam = c.req.query('status');

  const allowedStatuses = ['PENDING', 'PROCESSING', 'PAID', 'FAILED'] as const;
  type BatchStatus = (typeof allowedStatuses)[number];

  const where: { status?: BatchStatus } = {};
  if (statusParam && allowedStatuses.includes(statusParam as BatchStatus)) {
    where.status = statusParam as BatchStatus;
  }

  const [total, batches] = await Promise.all([
    prisma.payoutBatch.count({ where }),
    prisma.payoutBatch.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { entries: true } },
      },
    }),
  ]);

  return c.json({ data: batches, total, page: pageNum, perPage: take });
});

// ─── GET /v1/admin/payout-batches/:batchId ───────────────────────────────────
//
// Get a single payout batch with its full entry list.

app.get('/v1/admin/payout-batches/:batchId', ...adminGuard, async (c) => {
  const batchId = c.req.param('batchId');

  const batch = await prisma.payoutBatch.findUnique({
    where: { id: batchId },
    include: {
      entries: {
        orderBy: { createdAt: 'asc' },
        include: {
          seller: { select: { id: true, name: true, email: true } },
          payable: { select: { id: true, orderId: true, status: true } },
          ledgerEntry: {
            select: { id: true, feeType: true, description: true, orderId: true },
          },
        },
      },
    },
  });

  if (!batch) {
    return c.json(
      { statusCode: 404, error: 'Not Found', message: 'Payout batch not found' },
      404,
    );
  }

  return c.json(batch);
});

// ─── POST /v1/admin/payout-batches ───────────────────────────────────────────
//
// Generate a new payout batch from all PENDING payables and unsettled ledger
// entries within the given period.
//
// Body:
//   { "periodStart": "ISO date", "periodEnd": "ISO date", "sellerId"?: string, "notes"?: string }

app.post('/v1/admin/payout-batches', ...adminGuard, async (c) => {
  let body: { periodStart?: string; periodEnd?: string; sellerId?: string; notes?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { statusCode: 400, error: 'Bad Request', message: 'Invalid JSON body' },
      400,
    );
  }

  const periodStart = body.periodStart ? new Date(body.periodStart) : undefined;
  const periodEnd = body.periodEnd ? new Date(body.periodEnd) : undefined;

  if (!periodStart || isNaN(periodStart.getTime())) {
    return c.json(
      { statusCode: 422, error: 'Unprocessable Entity', message: 'periodStart is required and must be a valid date' },
      422,
    );
  }
  if (!periodEnd || isNaN(periodEnd.getTime())) {
    return c.json(
      { statusCode: 422, error: 'Unprocessable Entity', message: 'periodEnd is required and must be a valid date' },
      422,
    );
  }

  const result = await generatePayoutBatch({
    periodStart,
    periodEnd,
    sellerId: body.sellerId,
    notes: body.notes,
  });

  if (!result) {
    return c.json(
      {
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'No pending payables or ledger entries found for the given period',
      },
      422,
    );
  }

  return c.json(result, 201);
});

// ─── PATCH /v1/admin/payout-batches/:batchId/status ─────────────────────────
//
// Advance a batch to PROCESSING or PAID, or mark it FAILED.
// Body: { "status": "PROCESSING" | "PAID" | "FAILED" }

app.patch('/v1/admin/payout-batches/:batchId/status', ...adminGuard, async (c) => {
  const batchId = c.req.param('batchId');

  let body: { status?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { statusCode: 400, error: 'Bad Request', message: 'Invalid JSON body' },
      400,
    );
  }

  const allowedTransitions = ['PROCESSING', 'PAID', 'FAILED'] as const;
  type AllowedStatus = (typeof allowedTransitions)[number];

  if (!body.status || !allowedTransitions.includes(body.status as AllowedStatus)) {
    return c.json(
      {
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: `status must be one of: ${allowedTransitions.join(', ')}`,
      },
      422,
    );
  }

  const newStatus = body.status as AllowedStatus;

  const batch = await prisma.payoutBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true },
  });

  if (!batch) {
    return c.json(
      { statusCode: 404, error: 'Not Found', message: 'Payout batch not found' },
      404,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.payoutBatch.update({
      where: { id: batchId },
      data: {
        status: newStatus,
        ...(newStatus === 'PAID' ? { paidAt: new Date() } : {}),
      },
    });

    if (newStatus === 'PAID') {
      // Mark all payables in this batch as PAID
      await tx.sellerPayable.updateMany({
        where: { payoutEntry: { batchId } },
        data: { status: 'PAID' },
      });
    }

    return result;
  });

  return c.json(updated);
});

export { app as adminPayoutRoutes };
