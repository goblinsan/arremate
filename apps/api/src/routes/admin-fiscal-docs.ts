import { Hono } from 'hono';
import { prisma, Prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

// ─── Fiscal Documents ─────────────────────────────────────────────────────────

app.get('/v1/admin/fiscal-documents', ...adminGuard, async (c) => {
  const pageNum = Math.max(1, Number(c.req.query('page') ?? '1'));
  const take = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '30')));
  const skip = (pageNum - 1) * take;

  const statusParam = c.req.query('status');
  const responsibilityParam = c.req.query('invoiceResponsibility');
  const orderId = c.req.query('orderId');

  const where: {
    status?: 'PENDING' | 'ISSUED' | 'CANCELLED' | 'ERROR';
    invoiceResponsibility?: 'PLATFORM' | 'SELLER';
    orderId?: string;
  } = {};

  if (statusParam === 'PENDING' || statusParam === 'ISSUED' || statusParam === 'CANCELLED' || statusParam === 'ERROR') {
    where.status = statusParam;
  }
  if (responsibilityParam === 'PLATFORM' || responsibilityParam === 'SELLER') {
    where.invoiceResponsibility = responsibilityParam;
  }
  if (orderId) {
    where.orderId = orderId;
  }

  const [items, total] = await Promise.all([
    prisma.fiscalDocument.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            totalCents: true,
            status: true,
            seller: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    prisma.fiscalDocument.count({ where }),
  ]);

  return c.json({ data: items, meta: { total, page: pageNum, perPage: take } });
});

app.get('/v1/admin/fiscal-documents/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const doc = await prisma.fiscalDocument.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true,
          totalCents: true,
          status: true,
          seller: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!doc) return c.json({ statusCode: 404, error: 'Not Found', message: 'Fiscal document not found' }, 404);
  return c.json(doc);
});

app.post('/v1/admin/fiscal-documents', ...adminGuard, async (c) => {
  const admin = c.get('currentUser');
  const body = await c.req.json<{
    orderId?: string;
    invoiceResponsibility: 'PLATFORM' | 'SELLER';
    documentType: 'NFS_E_SERVICE_FEE' | 'NF_E_GOODS';
    externalId?: string;
    metadata?: Record<string, unknown>;
  }>().catch(() => null);

  if (!body) return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body' }, 400);
  if (body.invoiceResponsibility !== 'PLATFORM' && body.invoiceResponsibility !== 'SELLER') {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'invoiceResponsibility must be PLATFORM or SELLER' }, 400);
  }
  if (body.documentType !== 'NFS_E_SERVICE_FEE' && body.documentType !== 'NF_E_GOODS') {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'documentType must be NFS_E_SERVICE_FEE or NF_E_GOODS' }, 400);
  }

  if (body.orderId) {
    const order = await prisma.order.findUnique({ where: { id: body.orderId } });
    if (!order) return c.json({ statusCode: 404, error: 'Not Found', message: 'Order not found' }, 404);
  }

  const doc = await prisma.fiscalDocument.create({
    data: {
      orderId: body.orderId ?? null,
      invoiceResponsibility: body.invoiceResponsibility,
      documentType: body.documentType,
      status: 'PENDING',
      externalId: body.externalId ?? null,
      metadata: (body.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });

  await createAuditEvent({
    action: 'FISCAL_DOCUMENT_CREATED',
    actorId: admin.id,
    metadata: { fiscalDocumentId: doc.id, orderId: doc.orderId, documentType: doc.documentType },
  });

  return c.json(doc, 201);
});

app.patch('/v1/admin/fiscal-documents/:id/status', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const admin = c.get('currentUser');

  const body = await c.req.json<{
    status: 'PENDING' | 'ISSUED' | 'CANCELLED' | 'ERROR';
    externalId?: string;
    errorMessage?: string;
  }>().catch(() => null);

  if (!body) return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body' }, 400);
  if (!['PENDING', 'ISSUED', 'CANCELLED', 'ERROR'].includes(body.status)) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'status must be one of PENDING, ISSUED, CANCELLED, ERROR' }, 400);
  }

  const existing = await prisma.fiscalDocument.findUnique({ where: { id } });
  if (!existing) return c.json({ statusCode: 404, error: 'Not Found', message: 'Fiscal document not found' }, 404);

  const updated = await prisma.fiscalDocument.update({
    where: { id },
    data: {
      status: body.status,
      externalId: body.externalId !== undefined ? body.externalId : existing.externalId,
      errorMessage: body.errorMessage !== undefined ? body.errorMessage : existing.errorMessage,
      issuedAt: body.status === 'ISSUED' && !existing.issuedAt ? new Date() : existing.issuedAt,
    },
  });

  await createAuditEvent({
    action: 'FISCAL_DOCUMENT_STATUS_UPDATED',
    actorId: admin.id,
    metadata: { fiscalDocumentId: id, previousStatus: existing.status, newStatus: body.status },
  });

  return c.json(updated);
});

export { app as adminFiscalDocRoutes };
