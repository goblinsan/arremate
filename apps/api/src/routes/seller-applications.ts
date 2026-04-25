import { Hono } from 'hono';
import { prisma, type DocumentType } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { generateUploadUrl } from '../services/s3-upload.js';
import { randomUUID } from 'crypto';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ALLOWED_DOCUMENT_TYPES: DocumentType[] = ['IDENTITY', 'ADDRESS_PROOF', 'BUSINESS_REGISTRATION', 'OTHER'];

app.post('/v1/seller-applications', authenticate, async (c) => {
  const user = c.get('currentUser');
  const { businessName, businessType, taxId, phone, addressLine1, addressLine2, city, state, postalCode } =
    await c.req.json<Record<string, string | undefined>>();

  const existing = await prisma.sellerApplication.findUnique({ where: { userId: user.id } });

  if (existing && existing.status !== 'DRAFT') {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Application already submitted and cannot be edited' }, 409);
  }

  const application = existing
    ? await prisma.sellerApplication.update({
        where: { id: existing.id },
        data: { businessName, businessType, taxId, phone, addressLine1, addressLine2, city, state, postalCode },
      })
    : await prisma.sellerApplication.create({
        data: { userId: user.id, businessName, businessType, taxId, phone, addressLine1, addressLine2, city, state, postalCode },
      });

  return c.json(application, existing ? 200 : 201);
});

app.post('/v1/seller-applications/submit', authenticate, async (c) => {
  const user = c.get('currentUser');
  const application = await prisma.sellerApplication.findUnique({ where: { userId: user.id } });

  if (!application) return c.json({ statusCode: 404, error: 'Not Found', message: 'No seller application found' }, 404);
  if (application.status !== 'DRAFT') return c.json({ statusCode: 409, error: 'Conflict', message: `Application is already in status: ${application.status}` }, 409);
  if (!application.businessName || !application.taxId || !application.phone) {
    return c.json({ statusCode: 422, error: 'Unprocessable Entity', message: 'businessName, taxId, and phone are required before submission' }, 422);
  }

  const submitted = await prisma.sellerApplication.update({
    where: { id: application.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });
  return c.json(submitted);
});

app.get('/v1/seller-applications/me', authenticate, async (c) => {
  const user = c.get('currentUser');
  const application = await prisma.sellerApplication.findUnique({
    where: { userId: user.id },
    include: { documents: true },
  });
  if (!application) return c.json({ statusCode: 404, error: 'Not Found', message: 'No seller application found' }, 404);
  return c.json(application);
});

app.post('/v1/seller-applications/me/documents/upload-url', authenticate, async (c) => {
  const user = c.get('currentUser');
  const application = await prisma.sellerApplication.findUnique({ where: { userId: user.id } });

  if (!application) return c.json({ statusCode: 404, error: 'Not Found', message: 'No seller application found' }, 404);
  if (!['DRAFT', 'SUBMITTED'].includes(application.status)) {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Documents can only be uploaded for DRAFT or SUBMITTED applications' }, 409);
  }

  const { documentType, fileName, contentType } = await c.req.json<{ documentType: string; fileName: string; contentType: string }>();
  if (!documentType || !fileName || !contentType) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'documentType, fileName, and contentType are required' }, 400);
  }
  if (!ALLOWED_DOCUMENT_TYPES.includes(documentType as DocumentType)) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: `documentType must be one of: ${ALLOWED_DOCUMENT_TYPES.join(', ')}` }, 400);
  }
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: `contentType must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}` }, 400);
  }

  const ext = fileName.includes('.') ? fileName.split('.').pop() : 'bin';
  const s3Key = `seller-documents/${application.id}/${documentType}/${randomUUID()}.${ext}`;
  const result = await generateUploadUrl(s3Key, contentType);
  return c.json(result);
});

app.post('/v1/seller-applications/me/documents', authenticate, async (c) => {
  const user = c.get('currentUser');
  const application = await prisma.sellerApplication.findUnique({ where: { userId: user.id } });

  if (!application) return c.json({ statusCode: 404, error: 'Not Found', message: 'No seller application found' }, 404);
  if (!['DRAFT', 'SUBMITTED'].includes(application.status)) {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Documents can only be registered for DRAFT or SUBMITTED applications' }, 409);
  }

  const { documentType, fileName, s3Key, contentType, sizeBytes } = await c.req.json<{
    documentType: string; fileName: string; s3Key: string; contentType: string; sizeBytes?: number;
  }>();

  if (!documentType || !fileName || !s3Key || !contentType) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'documentType, fileName, s3Key, and contentType are required' }, 400);
  }
  if (!ALLOWED_DOCUMENT_TYPES.includes(documentType as DocumentType)) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: `documentType must be one of: ${ALLOWED_DOCUMENT_TYPES.join(', ')}` }, 400);
  }

  const doc = await prisma.sellerDocument.create({
    data: { applicationId: application.id, documentType: documentType as DocumentType, fileName, s3Key, contentType, sizeBytes: sizeBytes ?? null },
  });
  return c.json(doc, 201);
});

export { app as sellerApplicationRoutes };
