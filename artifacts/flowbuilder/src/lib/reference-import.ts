import type { ReferenceColumn, ReferenceValues } from '@workspace/api-client-react';

export const MAX_UPLOAD_ROWS = 5000;
export const MAX_TOTAL_ROWS = 10000;
export const MAX_COLUMNS = 20;

export interface ParsedRow { rowNumber: number; values: ReferenceValues }
export interface ParseResult { rows: ParsedRow[]; errors: string[]; skippedBlank: number; totalRead: number }

type Cell = unknown;

function cellToText(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

function normalize(raw: Cell, col: ReferenceColumn): { value: string | number | boolean | null; error?: string } {
  const text = cellToText(raw);
  if (text === '') return col.required ? { value: null, error: `"${col.label}" is required` } : { value: null };
  if (col.type === 'text') return { value: text };
  if (col.type === 'number') {
    const n = Number(text.replace(/,/g, ''));
    return Number.isFinite(n) ? { value: n } : { value: null, error: `"${col.label}" must be a number (got "${text}")` };
  }
  if (col.type === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (m) {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]) return { value: text };
    }
    return { value: null, error: `"${col.label}" must be a date as YYYY-MM-DD (got "${text}")` };
  }
  const b = text.toLowerCase();
  if (['true', 'yes', '1'].includes(b)) return { value: true };
  if (['false', 'no', '0'].includes(b)) return { value: false };
  return { value: null, error: `"${col.label}" must be true/false, yes/no or 1/0 (got "${text}")` };
}

export function mapAndValidate(grid: Cell[][], columns: ReferenceColumn[], existingRows: number): ParseResult {
  const errors: string[] = [];
  const out: ParseResult = { rows: [], errors, skippedBlank: 0, totalRead: 0 };
  if (!grid.length) { errors.push('The file is empty. Include a header row and at least one data row.'); return out; }
  const headers = grid[0].map(cellToText);
  const mapping: (ReferenceColumn | null)[] = [];
  const used = new Map<string, number>();
  headers.forEach((h, i) => {
    if (h === '') {
      if (grid.slice(1).some(r => cellToText(r[i]) !== '')) errors.push(`Column ${i + 1} has data but no header.`);
      mapping.push(null); return;
    }
    const lower = h.toLowerCase();
    const matches = columns.filter(c => c.key.toLowerCase() === lower || c.label.toLowerCase() === lower);
    if (matches.length === 0) { errors.push(`Unknown header "${h}". Use a column key or label of this table.`); mapping.push(null); return; }
    if (matches.length > 1) { errors.push(`Header "${h}" is ambiguous: it matches ${matches.map(m => `"${m.key}"`).join(' and ')}.`); mapping.push(null); return; }
    const col = matches[0];
    if (used.has(col.key)) { errors.push(`Column "${col.label}" appears twice (columns ${used.get(col.key)! + 1} and ${i + 1}).`); mapping.push(null); return; }
    used.set(col.key, i); mapping.push(col);
  });
  columns.filter(c => c.required && !used.has(c.key)).forEach(c => errors.push(`Required column "${c.label}" (${c.key}) is missing from the header row.`));
  if (errors.length) return out;

  const body = grid.slice(1);
  out.totalRead = body.length;
  body.forEach((r, idx) => {
    const rowNumber = idx + 2;
    if (r.every(c => cellToText(c) === '')) { out.skippedBlank++; return; }
    if (r.length > headers.length && r.slice(headers.length).some(c => cellToText(c) !== '')) {
      errors.push(`Row ${rowNumber}: has values beyond the last header.`);
    }
    const values: ReferenceValues = {};
    columns.forEach(c => {
      const i = used.get(c.key);
      const res = i === undefined ? { value: null } : normalize(r[i], c);
      if ('error' in res && res.error) errors.push(`Row ${rowNumber}: ${res.error}`);
      values[c.key] = res.value;
    });
    out.rows.push({ rowNumber, values });
  });
  if (out.rows.length === 0 && !errors.length) errors.push('No data rows found below the header.');
  if (out.rows.length > MAX_UPLOAD_ROWS) errors.push(`This file has ${out.rows.length} rows; the limit is ${MAX_UPLOAD_ROWS} per upload.`);
  if (existingRows + out.rows.length > MAX_TOTAL_ROWS) errors.push(`Appending ${out.rows.length} rows to ${existingRows} existing would exceed the ${MAX_TOTAL_ROWS} row table limit.`);
  return out;
}

export async function parseUpload(file: File, columns: ReferenceColumn[], existingRows: number): Promise<ParseResult> {
  if (file.size > 10 * 1024 * 1024) return { rows: [], skippedBlank: 0, totalRead: 0, errors: ['The upload limit is 10 MB. Split larger files into smaller uploads.'] };
  const name = file.name.toLowerCase();
  let grid: Cell[][];
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const Papa = (await import('papaparse')).default;
    const text = await file.text();
    const res = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { header: false, skipEmptyLines: false, dynamicTyping: false });
    const fatal = res.errors.filter(e => e.type !== 'Delimiter');
    if (fatal.length) return { rows: [], skippedBlank: 0, totalRead: 0, errors: fatal.slice(0, 20).map(e => `CSV parse error${e.row !== undefined ? ` near row ${e.row + 1}` : ''}: ${e.message}`) };
    grid = res.data;
    while (grid.length && grid[grid.length - 1].every(c => cellToText(c) === '')) grid.pop();
  } else if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser');
    try { grid = await readSheet(file, 1); } catch (e) {
      return { rows: [], skippedBlank: 0, totalRead: 0, errors: [`Could not read the XLSX file: ${e instanceof Error ? e.message : 'unknown error'}`] };
    }
  } else {
    return { rows: [], skippedBlank: 0, totalRead: 0, errors: ['Unsupported file type. Upload a .csv or .xlsx file.'] };
  }
  return mapAndValidate(grid, columns, existingRows);
}

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'table';

export async function exportRowsCsv(tableName: string, columns: ReferenceColumn[], rows: { values: ReferenceValues }[]) {
  const Papa = (await import('papaparse')).default;
  const csv = Papa.unparse({
    fields: columns.map(c => c.key),
    data: rows.map(r => columns.map(c => { const v = r.values[c.key]; return v === null || v === undefined ? '' : v; })),
  }, { escapeFormulae: true });
  download(`${slug(tableName)}.csv`, csv);
}

export async function exportTemplateCsv(tableName: string, columns: ReferenceColumn[]) {
  const Papa = (await import('papaparse')).default;
  download(`${slug(tableName)}-template.csv`, Papa.unparse({ fields: columns.map(c => c.key), data: [] }, { escapeFormulae: true }));
}
