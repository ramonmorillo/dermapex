// Lectura completa de tablas con paginación y conciliación de recuentos.
//
// PostgREST devuelve como máximo `max-rows` filas por petición (1000 por defecto en Supabase) SIN
// avisar del corte. Por eso cada tabla se lee por páginas con orden estable (clave única) y, al
// terminar, se compara el número de filas leídas con el recuento exacto de la base de datos. Si no
// coinciden (corte, error de paginación o datos modificados durante la exportación), la exportación
// falla: nunca se entrega una extracción incompleta como completa.

import type { SupabaseClient } from '@supabase/supabase-js';

export type TableRequest = {
  /** Tabla o vista de `public`. */
  table: string;
  /** Columnas (sintaxis select de PostgREST). */
  columns: string;
  /** Columna única para ordenar de forma estable. */
  orderBy: string;
};

export type TableResult<T> = {
  table: string;
  rows: T[];
  /** Recuento exacto en la base de datos (visible para el usuario según RLS) al iniciar la lectura. */
  dbCount: number;
  /** Recuento exacto tras la lectura: si difiere de dbCount, los datos cambiaron durante la exportación. */
  dbCountAfter: number;
  pages: number;
};

/** Abstracción mínima del origen de datos (permite probar con un origen en memoria). */
export type DataSource = {
  count(table: string): Promise<number>;
  page(request: TableRequest, from: number, to: number): Promise<unknown[]>;
};

export class ExportIntegrityError extends Error {}

export const DEFAULT_PAGE_SIZE = 500;

export async function readWholeTable<T>(source: DataSource, request: TableRequest, pageSize = DEFAULT_PAGE_SIZE): Promise<TableResult<T>> {
  const dbCount = await source.count(request.table);
  const rows: T[] = [];
  let pages = 0;
  for (;;) {
    // El desplazamiento avanza según las filas realmente recibidas: si el servidor aplica un límite
    // menor que el tamaño de página, no se salta ninguna fila.
    const from = rows.length;
    const page = (await source.page(request, from, from + pageSize - 1)) as T[];
    pages += 1;
    rows.push(...page);
    if (page.length === 0) break;
    if (page.length < pageSize && rows.length >= dbCount) break;
    if (pages > 100000) throw new ExportIntegrityError(`Paginación sin fin en ${request.table}.`);
  }
  const dbCountAfter = await source.count(request.table);

  if (dbCountAfter !== dbCount) {
    throw new ExportIntegrityError(
      `La tabla ${request.table} cambió durante la exportación (${dbCount} → ${dbCountAfter} registros). Vuelve a exportar cuando no haya nadie registrando datos.`,
    );
  }
  if (rows.length !== dbCount) {
    throw new ExportIntegrityError(
      `Exportación incompleta en ${request.table}: la base de datos tiene ${dbCount} registros y se han leído ${rows.length}. No se genera ningún fichero.`,
    );
  }
  const key = request.orderBy;
  const seen = new Set<unknown>();
  for (const row of rows as Array<Record<string, unknown>>) {
    const value = row[key];
    if (seen.has(value)) {
      throw new ExportIntegrityError(`Registro duplicado en la lectura de ${request.table} (${key} = ${String(value)}): error de paginación.`);
    }
    seen.add(value);
  }
  return { table: request.table, rows, dbCount, dbCountAfter, pages };
}

export function supabaseDataSource(client: SupabaseClient): DataSource {
  return {
    async count(table) {
      const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
      if (error) throw new ExportIntegrityError(`No se pudo contar ${table}: ${error.message}`);
      if (count === null) throw new ExportIntegrityError(`La base de datos no devolvió el recuento de ${table}.`);
      return count;
    },
    async page(request, from, to) {
      const { data, error } = await client
        .from(request.table)
        .select(request.columns)
        .order(request.orderBy, { ascending: true })
        .range(from, to);
      if (error) throw new ExportIntegrityError(`Error leyendo ${request.table}: ${error.message}`);
      return (data ?? []) as unknown[];
    },
  };
}
