import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildExportBundle, readAllTables, runResearchExport, type ExportOptions } from '../src/services/researchExport/bundle';
import { parseCsv, SPANISH_EXCEL_DIALECT, STANDARD_DIALECT, writeCsv, type CsvDialect } from '../src/services/researchExport/csv';
import { TABLE_REQUESTS, type RawData } from '../src/services/researchExport/datasets';
import { ExportIntegrityError, readWholeTable } from '../src/services/researchExport/reader';
import { escapeForSpss, unescapeFromSpss } from '../src/services/researchExport/spss';
import { readZip } from '../src/services/researchExport/zip';
import * as XLSX from 'xlsx';
import { memorySource, syntheticData, TRICKY_TEXTS } from './helpers/exportFixture';

const NOW = new Date('2026-10-28T12:00:00');
const options = (dialect: CsvDialect = STANDARD_DIALECT): ExportOptions => ({ dialect, bom: true, appVersion: 'test', userId: null, now: NOW });

async function exportAll(data: RawData, dialect: CsvDialect = STANDARD_DIALECT, serverMaxRows = 1000) {
  const bundle = await runResearchExport(memorySource(data, { serverMaxRows }), options(dialect));
  const files = new Map(readZip(bundle.zip).map((e) => [e.path, e.data]));
  const text = (path: string) => {
    const data = files.get(path);
    if (!data) throw new Error(`Falta ${path}`);
    return new TextDecoder().decode(data);
  };
  const table = (path: string) => {
    const [header, ...rows] = parseCsv(text(path), dialect.delimiter);
    return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  };
  return { bundle, files, text, table };
}

/** Celda CSV → valor tipado para comparar con el origen. */
function decode(cell: string, sourceValue: unknown, dialect: CsvDialect): unknown {
  if (cell === '') return null;
  if (typeof sourceValue === 'number') return Number(dialect.decimal === ',' ? cell.replace(',', '.') : cell);
  if (typeof sourceValue === 'boolean') return cell === '1';
  if (sourceValue !== null && typeof sourceValue === 'object') return JSON.parse(cell);
  return cell;
}

describe('CSV RFC 4180', () => {
  it('conserva exactamente textos difíciles (separadores, comillas, saltos de línea, ñ, emoji, espacios, ceros)', () => {
    for (const dialect of [STANDARD_DIALECT, SPANISH_EXCEL_DIALECT]) {
      const rows = TRICKY_TEXTS.map((t) => [t, null, '0']);
      const csv = writeCsv(['texto', 'vacio', 'cero'], rows, dialect);
      const [header, ...body] = parseCsv(csv, dialect.delimiter);
      expect(header).toEqual(['texto', 'vacio', 'cero']);
      expect(body.map((r) => r[0])).toEqual(TRICKY_TEXTS);
      // Un vacío sigue siendo vacío y un 0 sigue siendo 0.
      expect(body.every((r) => r[1] === '' && r[2] === '0')).toBe(true);
    }
  });
});

describe('Lectura paginada y conciliada', () => {
  const big = { ...syntheticData({ patients: 2 }), visits: Array.from({ length: 5003 }, (_, i) => ({ id: `id-${String(i).padStart(6, '0')}`, patient_id: 'x' })) } as RawData;

  it('lee las 5003 filas aunque el servidor corte a 1000 por petición', async () => {
    const result = await readWholeTable(memorySource(big, { serverMaxRows: 1000 }), TABLE_REQUESTS.visits, 500);
    expect(result.rows).toHaveLength(5003);
    expect(result.dbCount).toBe(5003);
  });

  it('no se salta filas si el límite del servidor es menor que el tamaño de página', async () => {
    const result = await readWholeTable(memorySource(big, { serverMaxRows: 100 }), TABLE_REQUESTS.visits, 500);
    expect(result.rows).toHaveLength(5003);
    expect(new Set(result.rows.map((r) => (r as { id: string }).id)).size).toBe(5003);
  });

  it('falla (no entrega) si la base de datos devuelve menos filas que su recuento', async () => {
    const source = memorySource(big, { truncateTable: { table: 'visits', maxTotal: 1000 } });
    await expect(readWholeTable(source, TABLE_REQUESTS.visits, 500)).rejects.toThrow(ExportIntegrityError);
  });

  it('falla si los datos cambian durante la exportación', async () => {
    const source = memorySource(big, { mutateTable: 'visits' });
    await expect(readWholeTable(source, TABLE_REQUESTS.visits, 500)).rejects.toThrow(/cambió durante la exportación/);
  });

  it('falla si la paginación devuelve registros repetidos (orden inestable)', async () => {
    const source = memorySource(big, { unstableOrderTable: 'visits' });
    await expect(readWholeTable(source, TABLE_REQUESTS.visits, 500)).rejects.toThrow(ExportIntegrityError);
  });
});

describe('Paquete de exportación (datos sintéticos)', () => {
  const data = syntheticData({ patients: 60, interventionsPerVisit: 3 });

  it('cada tabla raw reproduce fielmente la base de datos (recuento y valor a valor)', async () => {
    for (const dialect of [STANDARD_DIALECT, SPANISH_EXCEL_DIALECT]) {
      const { table, bundle } = await exportAll(data, dialect);
      const map: Array<[string, keyof RawData]> = [
        ['raw/pacientes.csv', 'patients'], ['raw/visitas.csv', 'visits'], ['raw/intervenciones.csv', 'interventions'],
        ['raw/cuestionarios_registros.csv', 'questionnaires'], ['raw/medicacion_paciente.csv', 'patientMedications'],
        ['raw/medicacion_eventos.csv', 'medicationEvents'], ['raw/consentimientos.csv', 'consents'], ['raw/documentos_visita.csv', 'documents'],
        ['raw/cmo_estratificaciones_registro.csv', 'cmoRegistry'], ['raw/cmo_estratificaciones_items.csv', 'cmoItems'], ['raw/centros.csv', 'centers'],
      ];
      for (const [path, key] of map) {
        const rows = table(path);
        const source = [...data[key]].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        expect(rows, path).toHaveLength(source.length);
        const byId = new Map(rows.map((r) => [r.id, r]));
        for (const src of source) {
          const out = byId.get(String(src.id));
          expect(out, `${path} ${String(src.id)}`).toBeDefined();
          for (const [col, value] of Object.entries(src)) {
            if (!(col in out!)) continue; // columnas excluidas a propósito (documentadas)
            expect(decode(out![col], value, dialect), `${path}.${col}`).toEqual(value ?? null);
          }
        }
      }
      // Manifiesto: recuentos BD = exportados en todas las tablas.
      for (const t of bundle.manifest.source_tables) expect(t.exported_rows, t.table).toBe(t.db_count);
    }
  });

  it('LONG tiene una fila por visita y WIDE una por paciente, con variables por visita y cambio IEXPAC', async () => {
    const { table } = await exportAll(data);
    const long = table('analisis/long_visitas.csv');
    const wide = table('analisis/wide_pacientes.csv');
    expect(long).toHaveLength(data.visits.length);
    expect(wide).toHaveLength(data.patients.length);
    for (const row of wide) {
      const a = row.iexpac_total_v0;
      const b = row.iexpac_total_v12;
      if (a !== '' && b !== '') expect(Number(row.iexpac_total_cambio_v12_v0)).toBeCloseTo(Number(b) - Number(a), 4);
      else expect(row.iexpac_total_cambio_v12_v0).toBe('');
    }
    // Un paciente con la visita de mes 3 cancelada figura como cancelada, sin datos de esa visita.
    const cancelledPatient = data.patients.find((p) => data.visits.some((v) => v.patient_id === p.id && v.visit_status === 'cancelled' && v.visit_type === 'month_3'));
    if (cancelledPatient) {
      const row = wide.find((w) => w.study_code === cancelledPatient.study_code)!;
      expect(row.estado_v3).toBe('cancelled');
      expect(row.fecha_v3).toBe('');
    }
    // Nulo ≠ cero: visitas sin cuestionario tienen el total vacío, nunca 0.
    expect(long.filter((r) => r.iexpac_registrado === '0').every((r) => r.iexpac_total === '')).toBe(true);
  });

  it('exporta todas las respuestas individuales de los cuestionarios', async () => {
    const { table } = await exportAll(data);
    const items = table('analisis/cuestionarios_items.csv');
    const expected = data.questionnaires.reduce((sum, q) => sum + Object.keys(q.responses as object).length, 0);
    expect(items).toHaveLength(expected);
    // Cada valor coincide con el almacenado.
    const byKey = new Map(items.map((i) => [`${i.response_id}|${i.item}`, i]));
    for (const q of data.questionnaires) {
      for (const [item, value] of Object.entries(q.responses as Record<string, unknown>)) {
        const row = byKey.get(`${String(q.id)}|${item}`)!;
        expect(row.valor_texto).toBe(typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
  });

  it('no trunca relaciones uno-a-muchos por encima de 1000 registros', async () => {
    const many = syntheticData({ patients: 150, interventionsPerVisit: 4 });
    expect(many.interventions.length).toBeGreaterThan(1000);
    const { table, bundle } = await exportAll(many);
    expect(table('raw/intervenciones.csv')).toHaveLength(many.interventions.length);
    expect(bundle.manifest.source_tables.find((t) => t.table === 'interventions')!.pages).toBeGreaterThan(2);
  });

  it('el manifiesto contiene huellas SHA-256 correctas de cada fichero', async () => {
    const { bundle, files } = await exportAll(data);
    for (const f of bundle.manifest.files) {
      const content = files.get(f.path)!;
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', content));
      expect([...digest].map((b) => b.toString(16).padStart(2, '0')).join(''), f.path).toBe(f.sha256);
    }
    expect(files.has('manifest.json')).toBe(true);
    expect(files.has('diccionario_variables.csv')).toBe(true);
    expect(files.has('dermapex_export.xlsx')).toBe(true);
    expect(files.has('analisis/wide_pacientes.sps')).toBe(true);
  });

  it('el diccionario documenta todas las variables de todos los ficheros', async () => {
    const { table, bundle, text } = await exportAll(data);
    const dict = table('diccionario_variables.csv');
    for (const ds of bundle.manifest.datasets) {
      const header = parseCsv(text(`${ds.folder}/${ds.id}.csv`), ',')[0];
      for (const variable of header) expect(dict.some((d) => d.conjunto === ds.id && d.variable === variable), `${ds.id}.${variable}`).toBe(true);
    }
  });

  it('Excel y JSON contienen todas las filas y los valores originales', async () => {
    const { files, bundle } = await exportAll(data);
    const wb = XLSX.read(files.get('dermapex_export.xlsx')!, { type: 'array' });
    for (const ds of bundle.manifest.datasets) {
      const sheet = wb.Sheets[ds.id.slice(0, 31)];
      expect(sheet, ds.id).toBeDefined();
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
      expect(rows, ds.id).toHaveLength(ds.rows);
    }
    const visitas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.visitas, { defval: null });
    for (const v of data.visits) {
      const row = visitas.find((r) => r.id === v.id)!;
      expect(row.notes ?? null).toEqual(v.notes ?? null); // saltos de línea y comillas intactos
      expect(row.visit_date ?? null).toEqual(v.visit_date ?? null); // fecha como texto, sin desfase
    }
    const json = JSON.parse(new TextDecoder().decode(files.get('dermapex_export.json')!));
    expect(json.datasets.visitas.rows).toHaveLength(data.visits.length);
  });

  it('el escape para SPSS es reversible', () => {
    for (const t of [...TRICKY_TEXTS, 'a\\nb', '\\', 'fin\\']) expect(unescapeFromSpss(escapeForSpss(t)!)).toBe(t);
  });

  it('aborta si una fila trae una columna no definida (no se pierde en silencio)', async () => {
    const broken = syntheticData({ patients: 3 });
    broken.visits[0] = { ...broken.visits[0], columna_nueva: 'x' };
    const { raw, results } = await readAllTables(memorySource(broken));
    raw.visits[0] = { ...raw.visits[0], columna_nueva: 'x' };
    await expect(buildExportBundle(raw, results, options())).rejects.toThrow(/columnas no definidas/);
  });

  it('escenario de alto volumen: 600 pacientes', async () => {
    const vol = syntheticData({ patients: 600, interventionsPerVisit: 2, seed: 7 });
    const { bundle } = await exportAll(vol);
    expect(bundle.manifest.scope.patients).toBe(600);
    expect(bundle.manifest.source_tables.every((t) => t.ok)).toBe(true);
  }, 60000);

  it('escribe un paquete de muestra para la validación con PSPP si se pide (EXPORT_FIXTURE_DIR)', async () => {
    const dir = process.env.EXPORT_FIXTURE_DIR;
    if (!dir) return;
    for (const [name, dialect] of [['standard', STANDARD_DIALECT], ['spanish', SPANISH_EXCEL_DIALECT]] as const) {
      const { files } = await exportAll(data, dialect);
      for (const [path, content] of files) {
        const target = join(dir, name, path);
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, content);
      }
    }
    writeFileSync(join(dir, 'source.json'), JSON.stringify(data));
  });
});
