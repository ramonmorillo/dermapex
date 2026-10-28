// Sintaxis SPSS (.sps) para importar cada CSV con tipos, formatos, etiquetas de variable y de valores.
// Se genera a partir de la especificación de columnas y de los datos reales (anchuras y decimales
// máximos), para que ningún texto se trunque ni ningún decimal se redondee al importar.
// Verificada con GNU PSPP en las pruebas (scripts/validate-export-spss.py).

import type { CsvDialect } from './csv';
import type { ColumnSpec, Dataset } from './spec';

const MAX_STRING_BYTES = 32767;
const encoder = new TextEncoder();

export type SpssFormat = { input: string; display: string; width?: number; overflow?: boolean };

function maxDecimals(values: unknown[]): number {
  let max = 0;
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const text = String(v);
    const dot = text.indexOf('.');
    if (dot >= 0 && !/e/i.test(text)) max = Math.max(max, text.length - dot - 1);
  }
  return Math.min(max, 16);
}

function maxIntegerDigits(values: unknown[]): number {
  let max = 1;
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    max = Math.max(max, String(Math.trunc(Math.abs(v))).length);
  }
  return max;
}

function maxBytes(values: string[]): number {
  let max = 1;
  for (const v of values) max = Math.max(max, encoder.encode(v).length);
  return max;
}

/** Formato SPSS de una columna según su tipo y los valores serializados reales. */
export function spssFormatFor(column: ColumnSpec, rawValues: unknown[], serialized: string[]): SpssFormat {
  switch (column.type) {
    case 'integer': {
      const w = Math.max(8, maxIntegerDigits(rawValues) + 1);
      return { input: `F${w}.0`, display: `F${w}.0` };
    }
    case 'decimal': {
      const d = Math.max(2, maxDecimals(rawValues));
      const w = Math.min(40, Math.max(8, maxIntegerDigits(rawValues) + d + 2));
      return { input: `F${w}.${d}`, display: `F${w}.${d}` };
    }
    case 'boolean':
      return { input: 'F1.0', display: 'F1.0' };
    case 'date':
      return { input: 'SDATE10', display: 'SDATE10' };
    case 'datetime':
    case 'json':
    case 'string':
    default: {
      // El ancho debe admitir también los códigos con etiqueta de valor (aunque no aparezcan en los datos).
      const bytes = Math.max(maxBytes(serialized), maxBytes(Object.keys(column.values ?? {})));
      const width = Math.min(bytes, MAX_STRING_BYTES);
      return { input: `A${width}`, display: `A${width}`, width, overflow: bytes > MAX_STRING_BYTES };
    }
  }
}

function q(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/** Limita la longitud en bytes de una etiqueta (metadato, no dato) sin cortar caracteres UTF-8. */
function clipLabel(text: string, maxBytesLen: number): string {
  if (encoder.encode(text).length <= maxBytesLen) return text;
  let out = '';
  for (const ch of text) {
    if (encoder.encode(`${out}${ch}…`).length > maxBytesLen) break;
    out += ch;
  }
  return `${out}…`;
}

const isNumeric = (column: ColumnSpec) => column.type === 'integer' || column.type === 'decimal' || column.type === 'boolean';

/**
 * SPSS no lee campos con saltos de línea (GET DATA /DELCASE=LINE): para él se escribe una copia del CSV
 * con escape reversible solo en los textos: \ → \\, CR → \r, LF → \n. El CSV principal no se modifica.
 */
export function escapeForSpss(cell: string | null): string | null {
  if (cell === null) return null;
  return cell.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

export function unescapeFromSpss(text: string): string {
  return text.replace(/\\(\\|r|n)/g, (_, ch: string) => (ch === 'r' ? '\r' : ch === 'n' ? '\n' : '\\'));
}

export function buildSpsSyntax(dataset: Dataset, csvFileName: string, formats: SpssFormat[], dialect: CsvDialect, escapedNewlines = false): string {
  const lines: string[] = [];
  lines.push(`* DERMAPEX · ${dataset.title}.`);
  lines.push(`* Importa ${csvFileName} (UTF-8, separador «${dialect.delimiter}», decimal «${dialect.decimal}»).`);
  if (escapedNewlines) {
    lines.push('* Este CSV es una copia para SPSS: en los textos, los saltos de línea se han escrito como \\n (y \\r),');
    lines.push('* y la barra invertida como \\\\. El valor exacto está en el CSV principal (sin sufijo _spss).');
  }
  lines.push('* 1) Abra este fichero en SPSS en modo Unicode. 2) Si el CSV no está en el directorio de trabajo, ajuste la ruta con CD.');
  lines.push("* CD 'C:\\ruta\\a\\la\\carpeta'.");
  lines.push('* Celda vacía = dato no registrado (perdido del sistema). No se recodifica a 0.');
  lines.push(`SET DECIMAL=${dialect.decimal === ',' ? 'COMMA' : 'DOT'}.`);
  lines.push('GET DATA');
  lines.push('  /TYPE=TXT');
  lines.push(`  /FILE=${q(csvFileName)}`);
  lines.push("  /ENCODING='UTF8'");
  lines.push('  /ARRANGEMENT=DELIMITED');
  lines.push('  /DELCASE=LINE');
  lines.push('  /FIRSTCASE=2');
  lines.push(`  /DELIMITERS=${q(dialect.delimiter)}`);
  lines.push(`  /QUALIFIER='"'`);
  lines.push('  /VARIABLES=');
  dataset.columns.forEach((column, i) => lines.push(`    ${column.name} ${formats[i].input}`));
  lines.push('.');

  const displayFormats = dataset.columns
    .map((column, i) => ({ column, f: formats[i] }))
    .filter(({ f }) => f.display !== f.input);
  if (displayFormats.length > 0) {
    lines.push('FORMATS');
    displayFormats.forEach(({ column, f }) => lines.push(`  ${column.name} (${f.display})`));
    lines.push('.');
  }

  lines.push('VARIABLE LABELS');
  dataset.columns.forEach((column, i) => {
    const label = clipLabel(column.unit ? `${column.label} (${column.unit})` : column.label, 250);
    lines.push(`  ${column.name} ${q(label)}${i === dataset.columns.length - 1 ? '.' : ''}`);
  });

  const withValues = dataset.columns.filter((column) => column.values && Object.keys(column.values).length > 0);
  if (withValues.length > 0) {
    lines.push('VALUE LABELS');
    withValues.forEach((column, idx) => {
      const entries = Object.entries(column.values ?? {});
      const parts = entries.map(([value, label]) => `${isNumeric(column) ? value : q(value)} ${q(clipLabel(label, 120))}`);
      lines.push(`  ${idx === 0 ? '' : '/'}${column.name}`);
      parts.forEach((part) => lines.push(`    ${part}`));
    });
    lines.push('.');
  }

  const levels = {
    nominal: dataset.columns.filter((col) => !isNumeric(col) || col.type === 'boolean' || (col.values && col.type === 'integer')),
    scale: dataset.columns.filter((col) => (col.type === 'integer' || col.type === 'decimal') && !col.values),
  };
  const pushLevel = (cols: ColumnSpec[], level: string) => {
    if (cols.length === 0) return;
    lines.push('VARIABLE LEVEL');
    for (let i = 0; i < cols.length; i += 6) lines.push(`  ${cols.slice(i, i + 6).map((col) => col.name).join(' ')}`);
    lines.push(`  (${level}).`);
  };
  pushLevel(levels.scale, 'SCALE');
  pushLevel(levels.nominal, 'NOMINAL');
  lines.push('EXECUTE.');
  lines.push(`* Para guardar en formato SPSS: SAVE OUTFILE=${q(csvFileName.replace(/\.csv$/, '.sav'))}.`);
  return `${lines.join('\r\n')}\r\n`;
}
