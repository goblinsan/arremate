const BULK_IMPORT_ROW_LIMIT = 200;
const VALID_CONDITIONS = new Set(['NEW', 'USED', 'REFURBISHED']);

export type ParsedBulkInventoryRow = {
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

export function parseBulkInventoryRows(rowsText: string): ParsedBulkInventoryRow[] {
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
