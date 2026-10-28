// Definición única de las variables exportadas. De aquí salen las cabeceras (fijas), el diccionario
// de datos, la sintaxis SPSS y el tipo de cada celda en Excel: una sola fuente de verdad.

import type { CsvCell, CsvDialect } from './csv';

export type ColumnType =
  | 'string' // texto libre o código
  | 'integer'
  | 'decimal'
  | 'date' // fecha clínica AAAA-MM-DD
  | 'datetime' // marca temporal de registro (UTC, ISO 8601)
  | 'boolean' // 1 = sí, 0 = no, vacío = no consta
  | 'json'; // estructura original serializada (para reconstrucción fiel)

export type ColumnSpec = {
  /** Nombre técnico estable: minúsculas, dígitos y _, empieza por letra, ≤ 64 caracteres (SPSS). */
  name: string;
  label: string;
  type: ColumnType;
  definition?: string;
  unit?: string;
  /** Valores admitidos y su etiqueta (variables categóricas). */
  values?: Record<string, string>;
  instrument?: string;
  /** Visita a la que se refiere (variables WIDE) o «todas». */
  visit?: string;
  /** Origen: «tabla.columna» o «derivada». */
  source: string;
  /** Regla de cálculo de las variables derivadas. */
  rule?: string;
  notes?: string;
};

export type Dataset = {
  /** Identificador estable (nombre de fichero sin extensión). */
  id: string;
  /** Carpeta dentro del ZIP: raw (tablas tal cual) o analisis (conjuntos analíticos). */
  folder: 'raw' | 'analisis';
  title: string;
  /** Qué representa cada fila. */
  grain: string;
  /** Clave única de fila (para verificar duplicados). */
  key: string[];
  columns: ColumnSpec[];
  rows: Array<Record<string, unknown>>;
};

export const MISSING_CODE_NOTE =
  'Celda vacía = dato no registrado en la base de datos (perdido del sistema). No se imputa ni se convierte en 0.';

const NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const SPSS_RESERVED = new Set(['all', 'and', 'by', 'eq', 'ge', 'gt', 'le', 'lt', 'ne', 'not', 'or', 'to', 'with']);

export function assertValidColumnNames(dataset: Dataset): void {
  const seen = new Set<string>();
  for (const column of dataset.columns) {
    if (!NAME_PATTERN.test(column.name) || SPSS_RESERVED.has(column.name)) {
      throw new Error(`Nombre de variable no válido en ${dataset.id}: «${column.name}».`);
    }
    if (seen.has(column.name)) throw new Error(`Variable duplicada en ${dataset.id}: «${column.name}».`);
    seen.add(column.name);
  }
}

/**
 * Valor → celda de texto. Sin transformar contenido: los textos se exportan exactamente como están
 * almacenados (saltos de línea incluidos). null/undefined → vacío.
 */
export function serializeCell(value: unknown, type: ColumnType, dialect: CsvDialect): CsvCell {
  if (value === null || value === undefined) return null;
  switch (type) {
    case 'boolean':
      if (typeof value === 'boolean') return value ? '1' : '0';
      throw new Error(`Valor no booleano en columna booleana: ${JSON.stringify(value)}`);
    case 'integer':
    case 'decimal': {
      const num = typeof value === 'number' ? value : Number(value);
      if (typeof value === 'string' && value.trim() === '') return null;
      if (!Number.isFinite(num)) throw new Error(`Valor no numérico en columna numérica: ${JSON.stringify(value)}`);
      if (type === 'integer' && !Number.isInteger(num)) throw new Error(`Valor no entero en columna entera: ${num}`);
      // String(num) conserva todos los decimales significativos (sin redondeo ni notación local).
      // Se evita la notación exponencial (1e-7), que algunos lectores no interpretan como número.
      const plain = String(num);
      const text = /e/i.test(plain) ? num.toFixed(20).replace(/\.?0+$/, '') : plain;
      return dialect.decimal === ',' ? text.replace('.', ',') : text;
    }
    case 'date':
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) {
        throw new Error(`Fecha no válida: ${JSON.stringify(value)}`);
      }
      return value.slice(0, 10);
    case 'datetime':
      return String(value);
    case 'json':
      return JSON.stringify(value);
    case 'string':
    default:
      return typeof value === 'string' ? value : JSON.stringify(value);
  }
}
