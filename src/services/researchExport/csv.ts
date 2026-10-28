// CSV conforme a RFC 4180: campos entre comillas cuando contienen el separador, comillas, CR o LF;
// comillas internas duplicadas; fin de línea CRLF. No se transforma ningún valor: los saltos de línea
// dentro de un texto se conservan (entre comillas). El lector se usa en las pruebas de reimportación.

export type CsvDialect = {
  /** Separador de campos. ',' (estándar) o ';' (Excel con configuración regional española). */
  delimiter: ',' | ';';
  /** Separador decimal de los números. '.' (estándar) o ',' (configuración regional española). */
  decimal: '.' | ',';
};

export const STANDARD_DIALECT: CsvDialect = { delimiter: ',', decimal: '.' };
export const SPANISH_EXCEL_DIALECT: CsvDialect = { delimiter: ';', decimal: ',' };

/** Celda ya serializada: null = vacío (dato ausente). Nunca se convierte un vacío en 0. */
export type CsvCell = string | null;

export function quoteCsvField(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function writeCsv(headers: string[], rows: CsvCell[][], dialect: CsvDialect): string {
  const lines = [headers.map((h) => quoteCsvField(h, dialect.delimiter)).join(dialect.delimiter)];
  for (const row of rows) {
    lines.push(row.map((cell) => (cell === null ? '' : quoteCsvField(cell, dialect.delimiter))).join(dialect.delimiter));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** Lector RFC 4180 (admite saltos de línea dentro de comillas). Devuelve todas las filas, cabecera incluida. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      fieldStarted = false;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldStarted = false;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  if (inQuotes) throw new Error('CSV mal formado: comillas sin cerrar.');
  if (fieldStarted || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
