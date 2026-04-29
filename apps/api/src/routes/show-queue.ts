import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const sellerGuard = [authenticate, requireRole('SELLER', 'ADMIN')] as const;
const BULK_IMPORT_ROW_LIMIT = 200;
const VALID_CONDITIONS = new Set(['NEW', 'USED', 'REFURBISHED']);

type ParsedBulkRow = {
  title: string;
  startingPrice: number;
  condition: 'NEW' | 'USED' | 'REFURBISHED';
  description: string | null;
};

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, '').trim());
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function parseBulkRows(rowsText: string): ParsedBulkRow[] {
  const lines = rowsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('Cole pelo menos uma linha para importar.');
  }
  if (lines.length > BULK_IMPORT_ROW_LIMIT + 1) {
    throw new Error(`Limite de ${BULK_IMPORT_ROW_LIMIT} linhas por importação.`);
  }

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const firstRow = splitDelimitedLine(lines[0], delimiter);
  const normalizedHeaders = firstRow.map(normalizeHeader);
  const hasHeader = normalizedHeaders.some((header) => ['title', 'titulo', 'startingprice', 'preco', 'precoinicial', 'condition', 'descricao', 'description'].includes(header));

  const titleIndex = hasHeader ? normalizedHeaders.findIndex((header) => header === 'title' || header === 'titulo') : 0;
  const priceIndex = hasHeader ? normalizedHeaders.findIndex((header) => header === 'startingprice' || header === 'preco' || header === 'precoinicial' || header === 'price') : 1;
  const conditionIndex = hasHeader ? normalizedHeaders.findIndex((header) => header === 'condition' || header === 'condicao') : 2;
  const descriptionIndex = hasHeader ? normalizedHeaders.findIndex((header) => header === 'description' || header === 'descricao') : 3;

  if (titleIndex === -1 || priceIndex === -1) {
    throw new Error('O cabeçalho precisa incluir ao menos as colunas title e startingPrice.');
  }

  const dataLines = hasHeader ? lines.slice(1) : lines;
  if (dataLines.length === 0) {
    throw new Error('Nenhuma linha de item encontrada após o cabeçalho.');
  }

  return dataLines.map((line, index) => {
    const columns = splitDelimitedLine(line, delimiter);
    const title = (columns[titleIndex] ?? '').trim();
    const rawPrice = (columns[priceIndex] ?? '').trim().replace(/\./g, '').replace(',', '.');
    const condition = (columns[conditionIndex] ?? '').trim().toUpperCase();
    const description = (columns[descriptionIndex] ?? '').trim();

    if (!title) {
      throw new Error(`Linha ${index + 1}: título é obrigatório.`);
    }

    const startingPrice = Number(rawPrice);
    if (!Number.isFinite(startingPrice) || startingPrice < 0) {
      throw new Error(`Linha ${index + 1}: startingPrice inválido.`);
    }

    return {
      title,
      startingPrice,
      condition: VALID_CONDITIONS.has(condition) ? (condition as 'NEW' | 'USED' | 'REFURBISHED') : 'NEW',
      description: description || null,
    };
  });
}

app.get('/v1/seller/shows/:showId/queue', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  const queueItems = await prisma.showInventoryItem.findMany({
    where: { showId },
    orderBy: { position: 'asc' },
    include: { inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } } },
  });
  return c.json(queueItems);
});

app.post('/v1/seller/shows/:showId/queue', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const { inventoryItemId, position } = await c.req.json<{ inventoryItemId: string; position?: number }>();
  if (!inventoryItemId) return c.json({ statusCode: 400, error: 'Bad Request', message: 'inventoryItemId is required' }, 400);
  const [show, inventoryItem] = await Promise.all([
    prisma.show.findUnique({ where: { id: showId } }),
    prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } }),
  ]);
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  if (!inventoryItem || inventoryItem.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Inventory item not found' }, 404);
  let queuePosition = position ?? 0;
  if (position === undefined) {
    const lastItem = await prisma.showInventoryItem.findFirst({ where: { showId }, orderBy: { position: 'desc' } });
    queuePosition = lastItem ? lastItem.position + 1 : 0;
  }
  try {
    const entry = await prisma.showInventoryItem.create({
      data: { showId, inventoryItemId, position: queuePosition },
      include: { inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } } },
    });
    return c.json(entry, 201);
  } catch (err) {
    const error = err as { code?: string };
    if (error?.code === 'P2002') return c.json({ statusCode: 409, error: 'Conflict', message: 'This item is already in the queue' }, 409);
    throw err;
  }
});

app.post('/v1/seller/shows/:showId/queue/bulk-import', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const { rowsText } = await c.req.json<{ rowsText?: string }>();

  if (typeof rowsText !== 'string' || rowsText.trim() === '') {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'rowsText is required' }, 400);
  }

  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  }
  if (show.status === 'CANCELLED' || show.status === 'ENDED') {
    return c.json({ statusCode: 409, error: 'Conflict', message: 'Cannot import items into a cancelled or ended show' }, 409);
  }

  let rows: ParsedBulkRow[];
  try {
    rows = parseBulkRows(rowsText);
  } catch (err) {
    return c.json({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: err instanceof Error ? err.message : 'Não foi possível interpretar o arquivo.',
    }, 422);
  }

  const createdEntries = await prisma.$transaction(async (tx) => {
    const lastItem = await tx.showInventoryItem.findFirst({
      where: { showId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    let nextPosition = lastItem ? lastItem.position + 1 : 0;
    const entries = [];

    for (const row of rows) {
      const inventoryItem = await tx.inventoryItem.create({
        data: {
          sellerId: user.id,
          title: row.title,
          description: row.description,
          condition: row.condition,
          startingPrice: row.startingPrice,
        },
      });

      const entry = await tx.showInventoryItem.create({
        data: {
          showId,
          inventoryItemId: inventoryItem.id,
          position: nextPosition,
        },
        include: {
          inventoryItem: {
            include: {
              images: { orderBy: { position: 'asc' } },
            },
          },
        },
      });

      entries.push(entry);
      nextPosition += 1;
    }

    return entries;
  });

  return c.json({ createdCount: createdEntries.length, entries: createdEntries }, 201);
});

app.delete('/v1/seller/shows/:showId/queue/:itemId', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const itemId = c.req.param('itemId');
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  const entry = await prisma.showInventoryItem.findUnique({ where: { id: itemId } });
  if (!entry || entry.showId !== showId) return c.json({ statusCode: 404, error: 'Not Found', message: 'Queue entry not found' }, 404);
  await prisma.showInventoryItem.delete({ where: { id: itemId } });
  return c.body(null, 204);
});

app.patch('/v1/seller/shows/:showId/queue/reorder', ...sellerGuard, async (c) => {
  const user = c.get('currentUser');
  const showId = c.req.param('showId');
  const { order } = await c.req.json<{ order: string[] }>();
  if (!Array.isArray(order)) return c.json({ statusCode: 400, error: 'Bad Request', message: 'order must be an array of queue entry IDs' }, 400);
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) return c.json({ statusCode: 404, error: 'Not Found', message: 'Show not found' }, 404);
  await prisma.$transaction(order.map((entryId, index) => prisma.showInventoryItem.updateMany({ where: { id: entryId, showId }, data: { position: index } })));
  const updated = await prisma.showInventoryItem.findMany({
    where: { showId },
    orderBy: { position: 'asc' },
    include: { inventoryItem: { include: { images: { orderBy: { position: 'asc' } } } } },
  });
  return c.json(updated);
});

export { app as showQueueRoutes };
