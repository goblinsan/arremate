import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { generateUploadUrl } from '../services/s3-upload.js';
import { randomUUID } from 'crypto';

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

/**
 * Seller-facing application routes.
 *
 * POST /v1/seller-applications            – create or update a draft application
 * POST /v1/seller-applications/submit     – submit the application for review
 * GET  /v1/seller-applications/me         – get the current user's application
 * POST /v1/seller-applications/me/documents/upload-url – request a signed S3 upload URL
 * POST /v1/seller-applications/me/documents           – register an uploaded document
 */
export async function sellerApplicationRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Create / update draft ──────────────────────────────────────────────────
  fastify.post(
    '/v1/seller-applications',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;

      const {
        businessName,
        businessType,
        taxId,
        phone,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
      } = request.body as Record<string, string | undefined>;

      // Upsert: create if none exists, update if already in DRAFT
      const existing = await prisma.sellerApplication.findUnique({
        where: { userId: user.id },
      });

      if (existing && existing.status !== 'DRAFT') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Application already submitted and cannot be edited',
        });
      }

      const application = existing
        ? await prisma.sellerApplication.update({
            where: { id: existing.id },
            data: {
              businessName,
              businessType,
              taxId,
              phone,
              addressLine1,
              addressLine2,
              city,
              state,
              postalCode,
            },
          })
        : await prisma.sellerApplication.create({
            data: {
              userId: user.id,
              businessName,
              businessType,
              taxId,
              phone,
              addressLine1,
              addressLine2,
              city,
              state,
              postalCode,
            },
          });

      return reply.status(existing ? 200 : 201).send(application);
    },
  );

  // ─── Submit application ─────────────────────────────────────────────────────
  fastify.post(
    '/v1/seller-applications/submit',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;

      const application = await prisma.sellerApplication.findUnique({
        where: { userId: user.id },
      });

      if (!application) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'No seller application found',
        });
      }

      if (application.status !== 'DRAFT') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: `Application is already in status: ${application.status}`,
        });
      }

      // Validate required fields
      if (!application.businessName || !application.taxId || !application.phone) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: 'businessName, taxId, and phone are required before submission',
        });
      }

      const submitted = await prisma.sellerApplication.update({
        where: { id: application.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
        },
      });

      return reply.send(submitted);
    },
  );

  // ─── Get current user's application ────────────────────────────────────────
  fastify.get(
    '/v1/seller-applications/me',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;

      const application = await prisma.sellerApplication.findUnique({
        where: { userId: user.id },
        include: { documents: true },
      });

      if (!application) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'No seller application found',
        });
      }

      return reply.send(application);
    },
  );

  // ─── Request a signed S3 upload URL ────────────────────────────────────────
  fastify.post(
    '/v1/seller-applications/me/documents/upload-url',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;

      const application = await prisma.sellerApplication.findUnique({
        where: { userId: user.id },
      });

      if (!application) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'No seller application found',
        });
      }

      if (!['DRAFT', 'SUBMITTED'].includes(application.status)) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Documents can only be uploaded for DRAFT or SUBMITTED applications',
        });
      }

      const { documentType, fileName, contentType } = request.body as {
        documentType: string;
        fileName: string;
        contentType: string;
      };

      if (!documentType || !fileName || !contentType) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'documentType, fileName, and contentType are required',
        });
      }

      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `contentType must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
        });
      }

      const ext = fileName.includes('.') ? fileName.split('.').pop() : 'bin';
      const s3Key = `seller-documents/${application.id}/${documentType}/${randomUUID()}.${ext}`;

      const result = await generateUploadUrl(s3Key, contentType);

      return reply.send(result);
    },
  );

  // ─── Register uploaded document ─────────────────────────────────────────────
  fastify.post(
    '/v1/seller-applications/me/documents',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;

      const application = await prisma.sellerApplication.findUnique({
        where: { userId: user.id },
      });

      if (!application) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'No seller application found',
        });
      }

      if (!['DRAFT', 'SUBMITTED'].includes(application.status)) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Documents can only be registered for DRAFT or SUBMITTED applications',
        });
      }

      const { documentType, fileName, s3Key, contentType, sizeBytes } =
        request.body as {
          documentType: string;
          fileName: string;
          s3Key: string;
          contentType: string;
          sizeBytes?: number;
        };

      if (!documentType || !fileName || !s3Key || !contentType) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'documentType, fileName, s3Key, and contentType are required',
        });
      }

      const doc = await prisma.sellerDocument.create({
        data: {
          applicationId: application.id,
          documentType: documentType as 'IDENTITY' | 'ADDRESS_PROOF' | 'BUSINESS_REGISTRATION' | 'OTHER',
          fileName,
          s3Key,
          contentType,
          sizeBytes: sizeBytes ?? null,
        },
      });

      return reply.status(201).send(doc);
    },
  );
}
