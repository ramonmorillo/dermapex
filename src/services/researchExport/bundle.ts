// Orquestación de la exportación de investigación:
//   1. lectura completa y conciliada de cada tabla (reader.ts);
//   2. construcción de conjuntos (datasets.ts);
//   3. serialización CSV + sintaxis SPSS + Excel + JSON + diccionario;
//   4. VERIFICACIÓN antes de entregar: cada CSV se vuelve a leer y se compara celda a celda con lo
//      serializado, el ZIP se relee comprobando CRC y huellas, y los recuentos de filas raw se
//      comparan con los de la base de datos. Cualquier discrepancia aborta la exportación.
//   5. manifiesto con alcance, recuentos, huellas SHA-256, exclusiones e incidencias.

import * as XLSX from 'xlsx';

import { parseCsv, writeCsv, type CsvCell, type CsvDialect } from './csv';
import { buildDatasets, EXCLUDED_COLUMNS, QUESTIONNAIRE_SCORING_VERSION, TABLE_REQUESTS, type RawData, type TableKey } from './datasets';
import { ExportIntegrityError, readWholeTable, type DataSource, type TableResult } from './reader';
import { assertValidColumnNames, MISSING_CODE_NOTE, serializeCell, type ColumnSpec, type Dataset } from './spec';
import { buildSpsSyntax, escapeForSpss, spssFormatFor, type SpssFormat } from './spss';
import { buildZip, readZip, type ZipEntry } from './zip';

export const EXPORT_FORMAT_VERSION = 'dermapex-export-2.0';
const XLSX_CELL_LIMIT = 32767;

export type ExportOptions = {
  dialect: CsvDialect;
  /** BOM UTF-8 al inicio de cada CSV (Excel lo necesita para reconocer UTF-8). */
  bom: boolean;
  appVersion: string;
  userId: string | null;
  now?: Date;
};

export type ManifestTable = { table: string; db_count: number; exported_rows: number; pages: number; ok: boolean };
export type ManifestFile = { path: string; bytes: number; sha256: string; rows?: number };

export type ExportManifest = {
  format_version: string;
  export_id: string;
  generated_at: string;
  generated_by_user_id: string | null;
  app_version: string;
  questionnaire_scoring_version: string;
  csv: { encoding: 'UTF-8'; bom: boolean; delimiter: string; decimal: string; line_ending: 'CRLF'; quoting: 'RFC 4180' };
  scope: { description: string; centers: string[]; patients: number; visits: number };
  source_tables: ManifestTable[];
  datasets: Array<{ id: string; folder: string; title: string; grain: string; rows: number; columns: number }>;
  files: ManifestFile[];
  excluded_columns: typeof EXCLUDED_COLUMNS;
  integrity: { errors: number; to_review: number; detail_file: string };
  verification: { csv_roundtrip: 'ok'; zip_crc: 'ok'; source_counts: 'ok' };
  warnings: string[];
  missing_values: string;
};

export type ExportBundle = { fileName: string; zip: Uint8Array; manifest: ExportManifest };

// ── Lectura ───────────────────────────────────────────────────────────────

export async function readAllTables(source: DataSource, onProgress?: (table: string) => void): Promise<{ raw: RawData; results: TableResult<unknown>[] }> {
  const raw = {} as RawData;
  const results: TableResult<unknown>[] = [];
  // Secuencial: menos carga y recuentos más fiables que en paralelo.
  for (const [key, request] of Object.entries(TABLE_REQUESTS) as Array<[TableKey, (typeof TABLE_REQUESTS)[TableKey]]>) {
    onProgress?.(request.table);
    const result = await readWholeTable<Record<string, unknown>>(source, request);
    raw[key] = result.rows;
    results.push(result);
  }
  return { raw, results };
}

// ── Utilidades ────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function stamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function localIsoDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function randomId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function assertRowShape(dataset: Dataset): void {
  const names = new Set(dataset.columns.map((col) => col.name));
  dataset.rows.forEach((row, index) => {
    const keys = Object.keys(row);
    const extra = keys.filter((k) => !names.has(k));
    const missing = [...names].filter((n) => !(n in row));
    if (extra.length > 0 || missing.length > 0) {
      throw new ExportIntegrityError(
        `Estructura inesperada en ${dataset.id} (fila ${index + 1}): ${extra.length ? `columnas no definidas ${extra.join(', ')}` : ''}${extra.length && missing.length ? '; ' : ''}${missing.length ? `columnas ausentes ${missing.join(', ')}` : ''}. No se exporta para no perder datos en silencio.`,
      );
    }
  });
  const seen = new Set<string>();
  for (const row of dataset.rows) {
    const key = JSON.stringify(dataset.key.map((k) => row[k] ?? null));
    if (seen.has(key)) throw new ExportIntegrityError(`Fila duplicada en ${dataset.id} (clave ${dataset.key.join('+')} = ${key}).`);
    seen.add(key);
  }
}

type Serialized = { dataset: Dataset; cells: CsvCell[][]; formats: SpssFormat[] };

function serializeDataset(dataset: Dataset, dialect: CsvDialect): Serialized {
  assertValidColumnNames(dataset);
  assertRowShape(dataset);
  const cells = dataset.rows.map((row) =>
    dataset.columns.map((col) => {
      try {
        return serializeCell(row[col.name], col.type, dialect);
      } catch (error) {
        throw new ExportIntegrityError(`${dataset.id}.${col.name}: ${(error as Error).message}`);
      }
    }),
  );
  const formats = dataset.columns.map((col, i) =>
    spssFormatFor(
      col,
      dataset.rows.map((r) => r[col.name]),
      cells.map((row) => row[i] ?? ''),
    ),
  );
  return { dataset, cells, formats };
}

/** Relee el CSV y lo compara celda a celda con lo serializado (vacío ⇔ null). */
export function verifyCsvRoundtrip(text: string, headers: string[], cells: CsvCell[][], dialect: CsvDialect, label: string): void {
  const parsed = parseCsv(text, dialect.delimiter);
  const [header, ...body] = parsed;
  if (JSON.stringify(header) !== JSON.stringify(headers)) throw new ExportIntegrityError(`Verificación fallida en ${label}: cabecera distinta.`);
  if (body.length !== cells.length) throw new ExportIntegrityError(`Verificación fallida en ${label}: ${cells.length} filas escritas, ${body.length} releídas.`);
  for (let r = 0; r < cells.length; r += 1) {
    if (body[r].length !== headers.length) throw new ExportIntegrityError(`Verificación fallida en ${label}, fila ${r + 1}: número de columnas.`);
    for (let col = 0; col < headers.length; col += 1) {
      const expected = cells[r][col] ?? '';
      if (body[r][col] !== expected) throw new ExportIntegrityError(`Verificación fallida en ${label}, fila ${r + 1}, ${headers[col]}: el valor releído no coincide.`);
    }
  }
}

function dictionaryRows(serialized: Serialized[]): Array<Record<string, unknown>> {
  return serialized.flatMap(({ dataset, formats }) =>
    dataset.columns.map((col: ColumnSpec, i) => ({
      conjunto: dataset.id,
      fichero: `${dataset.folder}/${dataset.id}.csv`,
      variable: col.name,
      etiqueta: col.label,
      definicion: col.definition ?? null,
      tipo: col.type,
      unidad: col.unit ?? null,
      valores_admitidos: col.values ? Object.entries(col.values).map(([v, l]) => `${v} = ${l}`).join('; ') : null,
      instrumento: col.instrument ?? null,
      visita: col.visit ?? null,
      origen: col.source,
      regla_calculo: col.rule ?? null,
      valores_perdidos: 'Celda vacía = no registrado',
      formato_spss: formats[i].input,
      observaciones: col.notes ?? null,
    })),
  );
}

const DICTIONARY_COLUMNS: ColumnSpec[] = [
  'conjunto', 'fichero', 'variable', 'etiqueta', 'definicion', 'tipo', 'unidad', 'valores_admitidos', 'instrumento', 'visita', 'origen', 'regla_calculo', 'valores_perdidos', 'formato_spss', 'observaciones',
].map((name) => ({ name, label: name, type: 'string' as const, source: 'diccionario' }));

function buildWorkbook(serialized: Serialized[], dictionary: Array<Record<string, unknown>>, manifestRows: string[][], warnings: string[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const sheetName = (base: string) => {
    let name = base.slice(0, 31);
    let n = 2;
    while (usedNames.has(name)) name = `${base.slice(0, 28)}_${n++}`;
    usedNames.add(name);
    return name;
  };
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(manifestRows), sheetName('metadatos'));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([DICTIONARY_COLUMNS.map((c) => c.name), ...dictionary.map((r) => DICTIONARY_COLUMNS.map((c) => (r[c.name] as string | null) ?? ''))]),
    sheetName('diccionario'),
  );
  const ordered = [...serialized].sort((a, b) => (a.dataset.folder === b.dataset.folder ? 0 : a.dataset.folder === 'analisis' ? -1 : 1));
  for (const { dataset, cells } of ordered) {
    const tooLong = cells.some((row) => row.some((cell) => cell !== null && cell.length > XLSX_CELL_LIMIT));
    if (tooLong) {
      warnings.push(`Excel: la hoja ${dataset.id} no se incluye porque alguna celda supera ${XLSX_CELL_LIMIT} caracteres (límite de Excel). El CSV está completo.`);
      continue;
    }
    const aoa: unknown[][] = [dataset.columns.map((c) => c.name)];
    dataset.rows.forEach((row, r) => {
      aoa.push(
        dataset.columns.map((col, i) => {
          const value = row[col.name];
          if (value === null || value === undefined) return null;
          if (col.type === 'integer' || col.type === 'decimal') return Number(value);
          if (col.type === 'boolean') return value ? 1 : 0;
          // Fechas y textos como texto: sin conversión automática de Excel (zona horaria, ceros).
          return cells[r][i];
        }),
      );
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName(dataset.id));
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayLike<number>);
}

const README = (m: ExportManifest) => `DERMAPEX · Exportación de investigación
Formato ${m.format_version} · generada ${m.generated_at} · id ${m.export_id}

CONTENIDO
  manifest.json                 Alcance, recuentos por tabla (BD frente a fichero), huellas SHA-256 y verificaciones.
  diccionario_variables.csv     Diccionario de datos de todas las variables exportadas.
  raw/*.csv (+ .sps)            Cada tabla tal como está almacenada (reconstrucción y auditoría).
  analisis/long_visitas         Una fila por paciente y visita.
  analisis/wide_pacientes       Una fila por paciente; sufijos _v0 (basal), _v3, _v6, _v9, _v12 (meses).
  analisis/cuestionarios_items  Una fila por ítem respondido (respuestas individuales).
  analisis/estratificaciones_cmo, medicacion_por_visita, incidencias_integridad.
  dermapex_export.xlsx          Las mismas tablas en hojas, con diccionario y metadatos.
  dermapex_export.json          Las mismas tablas con los valores originales (tipos JSON).

CLAVES DE ENLACE
  Paciente: study_code (código del estudio, estable entre extracciones). Resto: UUID del registro.

VALORES PERDIDOS
  ${m.missing_values}

SPSS
  Cada CSV tiene su .sps en la misma carpeta. Abra el .sps, ajuste la ruta con CD si es necesario y ejecútelo.

CSV
  UTF-8${m.csv.bom ? ' con BOM' : ''}, separador «${m.csv.delimiter}», decimal «${m.csv.decimal}», comillas RFC 4180. Los saltos de línea de los textos se conservan entre comillas.

AVISO
  Puntuaciones de cuestionarios: ${m.questionnaire_scoring_version}.
  Datos seudonimizados de un estudio clínico: custodia según el protocolo y la normativa de protección de datos.
`;

// ── Construcción del paquete ──────────────────────────────────────────────

export async function buildExportBundle(raw: RawData, results: TableResult<unknown>[], options: ExportOptions): Promise<ExportBundle> {
  const now = options.now ?? new Date();
  const warnings: string[] = [];
  const { datasets, issues } = buildDatasets(raw, localIsoDate(now));

  // Conciliación: cada tabla raw exporta exactamente las filas leídas de la base de datos.
  const sourceTables: ManifestTable[] = results.map((r) => ({ table: r.table, db_count: r.dbCount, exported_rows: r.rows.length, pages: r.pages, ok: r.rows.length === r.dbCount }));
  if (sourceTables.some((t) => !t.ok)) throw new ExportIntegrityError('Recuento de filas distinto del de la base de datos.');

  const serialized = datasets.map((d) => serializeDataset(d, options.dialect));
  for (const s of serialized) {
    s.formats.forEach((f, i) => {
      if (f.overflow) warnings.push(`SPSS: ${s.dataset.id}.${s.dataset.columns[i].name} supera 32767 bytes en algún registro; en SPSS se truncaría. Use el CSV o el JSON.`);
    });
  }

  const entries: ZipEntry[] = [];
  const bomBytes = options.bom ? encoder.encode('﻿') : new Uint8Array(0);
  const withBom = (text: string) => {
    const body = encoder.encode(text);
    const out = new Uint8Array(bomBytes.length + body.length);
    out.set(bomBytes, 0);
    out.set(body, bomBytes.length);
    return out;
  };

  const rowsByPath = new Map<string, number>();
  for (const s of serialized) {
    const headers = s.dataset.columns.map((c) => c.name);
    const csvText = writeCsv(headers, s.cells, options.dialect);
    verifyCsvRoundtrip(csvText, headers, s.cells, options.dialect, `${s.dataset.folder}/${s.dataset.id}.csv`);
    const csvPath = `${s.dataset.folder}/${s.dataset.id}.csv`;
    entries.push({ path: csvPath, data: withBom(csvText) });
    rowsByPath.set(csvPath, s.cells.length);
    const hasNewlines = s.cells.some((row) => row.some((cell) => cell !== null && /[\r\n]/.test(cell)));
    let spssCsvName = `${s.dataset.id}.csv`;
    let spssFormats = s.formats;
    if (hasNewlines) {
      const escaped = s.cells.map((row) => row.map((cell, i) => (s.dataset.columns[i].type === 'string' || s.dataset.columns[i].type === 'json' ? escapeForSpss(cell) : cell)));
      const spssText = writeCsv(headers, escaped, options.dialect);
      verifyCsvRoundtrip(spssText, headers, escaped, options.dialect, `${s.dataset.folder}/${s.dataset.id}_spss.csv`);
      spssCsvName = `${s.dataset.id}_spss.csv`;
      entries.push({ path: `${s.dataset.folder}/${spssCsvName}`, data: withBom(spssText) });
      rowsByPath.set(`${s.dataset.folder}/${spssCsvName}`, escaped.length);
      spssFormats = s.dataset.columns.map((col, i) => spssFormatFor(col, s.dataset.rows.map((r) => r[col.name]), escaped.map((row) => row[i] ?? '')));
    }
    entries.push({ path: `${s.dataset.folder}/${s.dataset.id}.sps`, data: withBom(buildSpsSyntax(s.dataset, spssCsvName, spssFormats, options.dialect, hasNewlines)) });
  }

  const dictionary = dictionaryRows(serialized);
  const dictCells = dictionary.map((r) => DICTIONARY_COLUMNS.map((c) => (r[c.name] as string | null) ?? null));
  const dictText = writeCsv(DICTIONARY_COLUMNS.map((c) => c.name), dictCells, options.dialect);
  verifyCsvRoundtrip(dictText, DICTIONARY_COLUMNS.map((c) => c.name), dictCells, options.dialect, 'diccionario_variables.csv');
  entries.push({ path: 'diccionario_variables.csv', data: withBom(dictText) });
  rowsByPath.set('diccionario_variables.csv', dictCells.length);

  const centers = [...new Set(raw.centers.map((r) => String(r.code)))].sort();
  const manifest: ExportManifest = {
    format_version: EXPORT_FORMAT_VERSION,
    export_id: randomId(),
    generated_at: now.toISOString(),
    generated_by_user_id: options.userId,
    app_version: options.appVersion,
    questionnaire_scoring_version: QUESTIONNAIRE_SCORING_VERSION,
    csv: { encoding: 'UTF-8', bom: options.bom, delimiter: options.dialect.delimiter, decimal: options.dialect.decimal, line_ending: 'CRLF', quoting: 'RFC 4180' },
    scope: {
      description: 'Todos los registros visibles para el usuario que exporta según los permisos de la base de datos (RLS): su(s) centro(s); coordinación, todos los centros.',
      centers,
      patients: raw.patients.length,
      visits: raw.visits.length,
    },
    source_tables: sourceTables,
    datasets: datasets.map((d) => ({ id: d.id, folder: d.folder, title: d.title, grain: d.grain, rows: d.rows.length, columns: d.columns.length })),
    files: [],
    excluded_columns: EXCLUDED_COLUMNS,
    integrity: { errors: issues.filter((i) => i.gravedad === 'error').length, to_review: issues.filter((i) => i.gravedad === 'revisar').length, detail_file: 'analisis/incidencias_integridad.csv' },
    verification: { csv_roundtrip: 'ok', zip_crc: 'ok', source_counts: 'ok' },
    warnings,
    missing_values: MISSING_CODE_NOTE,
  };

  const manifestRows: string[][] = [
    ['clave', 'valor'],
    ['format_version', manifest.format_version],
    ['export_id', manifest.export_id],
    ['generated_at', manifest.generated_at],
    ['app_version', manifest.app_version],
    ['questionnaire_scoring_version', manifest.questionnaire_scoring_version],
    ['centros', centers.join(', ')],
    ['pacientes', String(manifest.scope.patients)],
    ['visitas', String(manifest.scope.visits)],
    ['incidencias_error', String(manifest.integrity.errors)],
    ['incidencias_revisar', String(manifest.integrity.to_review)],
    ...sourceTables.map((t) => [`tabla:${t.table}`, `BD ${t.db_count} · exportadas ${t.exported_rows}`]),
    ['valores_perdidos', MISSING_CODE_NOTE],
  ];
  entries.push({ path: 'dermapex_export.xlsx', data: buildWorkbook(serialized, dictionary, manifestRows, warnings) });

  const json = {
    format_version: EXPORT_FORMAT_VERSION,
    export_id: manifest.export_id,
    generated_at: manifest.generated_at,
    datasets: Object.fromEntries(datasets.map((d) => [d.id, { folder: d.folder, title: d.title, columns: d.columns.map((c) => c.name), rows: d.rows }])),
  };
  entries.push({ path: 'dermapex_export.json', data: encoder.encode(JSON.stringify(json, null, 1)) });

  for (const entry of entries) {
    manifest.files.push({ path: entry.path, bytes: entry.data.length, sha256: await sha256Hex(entry.data), rows: rowsByPath.get(entry.path) });
  }
  // README y manifiesto al final: el manifiesto contiene las huellas de todo lo demás.
  entries.push({ path: 'LEEME.txt', data: encoder.encode(README(manifest)) });
  entries.push({ path: 'manifest.json', data: encoder.encode(JSON.stringify(manifest, null, 2)) });

  const zip = buildZip(entries, now);

  // Verificación final del paquete: se relee el ZIP (CRC) y se comprueban las huellas.
  const reread = readZip(zip);
  if (reread.length !== entries.length) throw new ExportIntegrityError('Verificación del ZIP fallida: número de ficheros.');
  for (const file of manifest.files) {
    const entry = reread.find((e) => e.path === file.path);
    if (!entry || (await sha256Hex(entry.data)) !== file.sha256) throw new ExportIntegrityError(`Verificación del ZIP fallida en ${file.path}.`);
  }

  return { fileName: `dermapex_export_${stamp(now)}.zip`, zip, manifest };
}

export async function runResearchExport(source: DataSource, options: ExportOptions, onProgress?: (step: string) => void): Promise<ExportBundle> {
  const { raw, results } = await readAllTables(source, (table) => onProgress?.(`Leyendo ${table}…`));
  onProgress?.('Generando y verificando ficheros…');
  return buildExportBundle(raw, results, options);
}
