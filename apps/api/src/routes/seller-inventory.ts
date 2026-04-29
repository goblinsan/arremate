import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { parseBulkInventoryRows } from '../services/bulk-import.js';
import { generateUploadUrl } from '../services/s3-upload.js';
import { randomUUID } from 'crypto';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')] as const;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

app.get('/v1/seller/inventory', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const pageNum = Math.max(1, Number(c.req.query('page') ?? '1'));
  const take = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '20')));
  const skip = (pageNum - 1) * take;
  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { sellerId: user.id }, include: { images: { orderBy: { position: 'asc' }, take: 1 } }, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.inventoryItem.count({ where: { sellerId: user.id } }),
  ]);
  return c.json({ data: items, meta: { total, page: pageNum, perPage: take } });
});

app.post('/v1/seller/inventory', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const { title, description, condition, startingPrice } = await c.req.json<{ title: string; description?: string; condition?: string; startingPrice: number }>();
  if (!title || title.trim() === '') return c.json({ statusCode: 400, error: 'Bad Request', message: 'title is required' }, 400);
  if (startingPrice === undefined || isNaN(Number(startingPrice)) || Number(startingPrice) < 0) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'startingPrice must be a non-negative number' }, 400);
  }
  const validConditions = ['NEW', 'USED', 'REFURBISHED'];
  const itemCondition = condition && validConditions.includes(condition) ? condition : 'NEW';
  const item = await prisma.inventoryItem.create({
    data: { sellerId: user.id, title: title.trim(), description: description?.trim() ?? null, condition: itemCondition as 'NEW' | 'USED' | 'REFURBISHED', startingPrice: Number(startingPrice) },
    include: { images: true },
  });
  return c.json(item, 201);
});

app.post('/v1/seller/inventory/bulk-import', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const { rowsText } = await c.req.json<{ rowsText?: string }>();

  if (typeof rowsText !== 'string' || rowsText.trim() === '') {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'rowsText is required' }, 400);
  }

  let rows;
  try {
    rows = parseBulkInventoryRows(rowsText);
  } catch (err) {
    return c.json({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: err instanceof Error ? err.message : 'Não foi possível interpretar o arquivo.',
    }, 422);
  }

  const items = await prisma.$transaction(async (tx) => {
    const createdItems = [];

    for (const row of rows) {
      const item = await tx.inventoryItem.create({
        data: {
          sellerId: user.id,
          title: row.title,
          description: row.description,
          condition: row.condition,
          startingPrice: row.startingPrice,
        },
        include: { images: { orderBy: { position: 'asc' } } },
      });
      createdItems.push(item);
    }

    return createdItems;
  });

  return c.json({ createdCount: items.length, items }, 201);
});

app.get('/v1/seller/inventory/:id', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');
  const item = await prisma.inventoryItem.findUnique({ where: { id }, include: { images: { orderBy: { position: 'asc' } } } });
  if (!item || item.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Item not found' }, 404);
  return c.json(item);
});

app.patch('/v1/seller/inventory/:id', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');
  const { title, description, condition, startingPrice } = await c.req.json<{ title?: string; description?: string; condition?: string; startingPrice?: number }>();
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item || item.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Item not found' }, 404);
  const validConditions = ['NEW', 'USED', 'REFURBISHED'];
  const updated = await prisma.inventoryItem.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description?.trim() ?? null }),
      ...(condition !== undefined && validConditions.includes(condition) && { condition: condition as 'NEW' | 'USED' | 'REFURBISHED' }),
      ...(startingPrice !== undefined && { startingPrice: Number(startingPrice) }),
    },
    include: { images: { orderBy: { position: 'asc' } } },
  });
  return c.json(updated);
});

app.delete('/v1/seller/inventory/:id', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item || item.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Item not found' }, 404);
  await prisma.inventoryItem.delete({ where: { id } });
  return c.body(null, 204);
});

app.post('/v1/seller/inventory/:id/images/upload-url', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');
  const { fileName, contentType } = await c.req.json<{ fileName: string; contentType: string }>();
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item || item.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Item not found' }, 404);
  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: `contentType must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}` }, 400);
  }
  if (!fileName || fileName.trim() === '') return c.json({ statusCode: 400, error: 'Bad Request', message: 'fileName is required' }, 400);
  const s3Key = `inventory/${user.id}/${id}/${randomUUID()}-${fileName.trim()}`;
  const result = await generateUploadUrl(s3Key, contentType);
  return c.json(result);
});

app.post('/v1/seller/inventory/:id/images', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const id = c.req.param('id');
  const { s3Key, contentType, fileName, position } = await c.req.json<{ s3Key: string; contentType: string; fileName: string; position?: number }>();
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item || item.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Item not found' }, 404);
  if (!s3Key || !contentType || !fileName) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 's3Key, contentType, and fileName are required' }, 400);
  }
  let imagePosition = position ?? 0;
  if (position === undefined) {
    const maxImage = await prisma.inventoryImage.findFirst({ where: { itemId: id }, orderBy: { position: 'desc' } });
    imagePosition = maxImage ? maxImage.position + 1 : 0;
  }
  const image = await prisma.inventoryImage.create({ data: { itemId: id, s3Key, contentType, fileName, position: imagePosition } });
  return c.json(image, 201);
});

export { app as sellerInventoryRoutes };
