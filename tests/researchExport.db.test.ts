// Integración con el esquema REAL (migraciones + RLS) en un PostgreSQL LOCAL y desechable.
// Se omite salvo que EXPORT_DB_URL apunte a una base ya preparada con:
//   db-tests/00_local_supabase_stubs.sql + supabase/migrations/*.sql + e2e/seed.sql
// (ver docs/audit/DERMAPEX_EXPORTACION_VALIDACION.md). Nunca apuntar a Supabase.
//
// Comprueba, con las mismas peticiones que hace la app (TABLE_REQUESTS): que todas las columnas de
// tablas y vistas existen, que cada usuario solo exporta lo que su RLS le permite y que los recuentos
// cuadran. No cubre la capa HTTP de PostgREST (límite de filas), probada con el origen simulado.

import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { runResearchExport } from '../src/services/researchExport/bundle';
import { STANDARD_DIALECT } from '../src/services/researchExport/csv';
import type { DataSource } from '../src/services/researchExport/reader';
import { readZip } from '../src/services/researchExport/zip';

const DB = process.env.EXPORT_DB_URL;
const CMO_USER = 'aaaaaaaa-e2e0-4000-8000-000000000001';
const STD_USER = 'bbbbbbbb-e2e0-4000-8000-000000000001';
const COORD = 'cccccccc-e2e0-4000-8000-000000000001';

function psql(sql: string): string {
  if (!DB || /supabase\.(co|com)/.test(DB)) throw new Error('Solo bases locales.');
  return execFileSync('psql', [DB, '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
}

function asUser(uid: string, sql: string): string {
  return psql(`begin;
select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true) \\g /dev/null
set local role authenticated;
${sql}
commit;`);
}

function pgSource(uid: string): DataSource {
  return {
    async count(table) {
      return Number(asUser(uid, `select count(*) from public.${table};`));
    },
    async page(request, from, to) {
      const out = asUser(uid, `select coalesce(json_agg(t), '[]') from (select ${request.columns} from public.${request.table} order by ${request.orderBy} limit ${to - from + 1} offset ${from}) t;`);
      return JSON.parse(out) as unknown[];
    },
  };
}

const SEED = `
-- Datos adicionales 100 % ficticios.
insert into public.visits (patient_id, visit_type, visit_status, scheduled_date, notes, created_by)
select 'a0000000-e2e0-4000-8000-000000000001', 'extra', 'scheduled', date '2026-11-01' + g, case when g % 7 = 0 then E'nota con "comillas", ; y\\nsalto' end, '${CMO_USER}'
from generate_series(1, 1100) g;
insert into public.questionnaire_responses (visit_id, user_id, measurement_id, responses)
select 'a1000000-e2e0-4000-8000-000000000001', '${CMO_USER}', measurement_id,
  '{"q1":5,"q2":4,"q3":3,"q4":2,"q5":1,"q6":5,"q7":4,"q8":3,"q9":2,"q10":1,"q11":5,"q12":4}'::jsonb
from public.questionnaire_measurement_map where questionnaire_code = 'IEXPAC';
insert into public.interventions (visit_id, intervention_type, intervention_domain, delivered, notes, delivered_by)
select v.id, 'Educación sanitaria', 'Capacidad', true, 'ñandú «x»', '${CMO_USER}' from public.visits v where v.patient_id = 'a0000000-e2e0-4000-8000-000000000001' limit 1050;
insert into public.consents (patient_id, consent_type, document_version, status, granted_at, obtained_by)
values ('b0000000-e2e0-4000-8000-000000000001', 'estudio', '1.0', 'granted', now(), '${STD_USER}');
`;

describe.skipIf(!DB)('Exportación contra el esquema real y la RLS (PostgreSQL local)', () => {
  it('prepara datos ficticios y una estratificación CMO real', () => {
    psql(SEED);
    asUser(CMO_USER, `select public.save_cmo_stratification('a1000000-e2e0-4000-8000-000000000001', 'baseline', 'cmo-derma-model-1.0.0+src.227e444', 'cmo-dermapex-1.0.0+src.227e444',
      (select jsonb_object_agg(variable_code, case when value_type = 'select' then 'ninguna' else 'no' end) from public.cmo_variable_catalog where value_type <> 'derived_age'), 2, 3) \\g /dev/null`);
  });

  it('coordinación exporta todos los centros y los recuentos cuadran con la base de datos', { timeout: 120000 }, async () => {
    const bundle = await runResearchExport(pgSource(COORD), { dialect: STANDARD_DIALECT, bom: true, appVersion: 'db-test', userId: COORD });
    const counts = Object.fromEntries(bundle.manifest.source_tables.map((t) => [t.table, t.exported_rows]));
    expect(counts.patients).toBe(Number(psql('select count(*) from public.patients;')));
    expect(counts.visits).toBe(Number(psql('select count(*) from public.visits;')));
    expect(counts.visits).toBeGreaterThan(1000);
    expect(counts.interventions).toBe(Number(psql('select count(*) from public.interventions;')));
    expect(counts.cmo_stratification_registry).toBe(1);
    expect(counts.cmo_stratification_item_values).toBe(Number(psql('select count(*) from public.cmo_score_item_results;')));
    expect(bundle.manifest.scope.centers).toEqual(['E2E-CMO', 'E2E-STD']);
  });

  it('un investigador solo exporta su centro (RLS): ningún dato del otro centro en el paquete', { timeout: 120000 }, async () => {
    const bundle = await runResearchExport(pgSource(CMO_USER), { dialect: STANDARD_DIALECT, bom: true, appVersion: 'db-test', userId: CMO_USER });
    expect(bundle.manifest.scope.centers).toEqual(['E2E-CMO']);
    const allText = readZip(bundle.zip).map((e) => new TextDecoder().decode(e.data)).join('\n');
    expect(allText).not.toContain('E2E-STD-001');
    expect(allText).not.toContain('b0000000-e2e0-4000-8000-000000000001');

    const std = await runResearchExport(pgSource(STD_USER), { dialect: STANDARD_DIALECT, bom: true, appVersion: 'db-test', userId: STD_USER });
    expect(std.manifest.scope.centers).toEqual(['E2E-STD']);
    expect(std.manifest.source_tables.find((t) => t.table === 'consents')!.exported_rows).toBe(1);
    const stdText = readZip(std.zip).map((e) => new TextDecoder().decode(e.data)).join('\n');
    expect(stdText).not.toContain('E2E-CMO-001');
  });
});
