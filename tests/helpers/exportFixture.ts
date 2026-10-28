// Datos 100 % sintéticos para probar la exportación (sin datos reales de pacientes) y un origen de
// datos en memoria que reproduce el comportamiento de PostgREST, incluido el corte silencioso de filas.

import { AGE_GROUP_CODE, CMO_ANSWER_FIELDS, CMO_BLOCKS } from '../../src/constants/cmoDermapexModel';
import type { RawData, TableKey } from '../../src/services/researchExport/datasets';
import { TABLE_REQUESTS } from '../../src/services/researchExport/datasets';
import type { DataSource, TableRequest } from '../../src/services/researchExport/reader';

type Row = Record<string, unknown>;

/** PRNG determinista (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuid(prefix: number, n: number): string {
  const hex = n.toString(16).padStart(12, '0');
  return `${prefix.toString(16).padStart(8, '0')}-0000-4000-8000-${hex}`;
}

/** Textos difíciles: separadores, comillas, saltos de línea, tildes, ñ, emoji, espacios, ceros a la izquierda. */
export const TRICKY_TEXTS = [
  'Paciente refiere "picor intenso", empeora de noche; mejora con emolientes',
  'Línea 1\nLínea 2\r\nLínea 3',
  'Ñandú, acción, pingüino — «comillas latinas» y emoji 🧴',
  '  espacios al inicio y al final  ',
  '007',
  '=SUMA(A1:A2)',
  "Comilla simple ' y barra \\ invertida",
  'a;b;c,d,e',
];

export function syntheticData(options: { patients: number; seed?: number; interventionsPerVisit?: number }): RawData {
  const r = rng(options.seed ?? 42);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  const maybe = <T,>(value: T, pNull = 0.15): T | null => (r() < pNull ? null : value);

  const centers: Row[] = [
    { id: uuid(1, 1), code: 'HUVR', name: 'Centro sintético CMO', study_arm: 'cmo', study_number: 1, is_active: true },
    { id: uuid(1, 2), code: 'HUVM', name: 'Centro sintético estándar', study_arm: 'standard', study_number: 2, is_active: true },
  ];
  const patients: Row[] = [];
  const consents: Row[] = [];
  const visits: Row[] = [];
  const questionnaires: Row[] = [];
  const interventions: Row[] = [];
  const patientMedications: Row[] = [];
  const medicationEvents: Row[] = [];
  const documents: Row[] = [];
  const cmoRegistry: Row[] = [];
  const cmoItems: Row[] = [];
  const medicationCatalog: Row[] = [
    { id: uuid(9, 1), source: 'cima', source_code: '000001', display_name: 'DUPILUMAB 300 MG SOLUCIÓN INYECTABLE', active_ingredient: 'dupilumab', strength: '300 mg', form: 'solución inyectable', route: 'subcutánea', atc_code: 'D11AH05' },
    { id: uuid(9, 2), source: 'cima', source_code: '000002', display_name: 'TACROLIMUS 0,1% POMADA', active_ingredient: 'tacrolimus', strength: '0,1%', form: 'pomada', route: 'cutánea', atc_code: 'd11ah01' },
    { id: uuid(9, 3), source: 'manual', source_code: null, display_name: 'Emoliente "base" sin perfume', active_ingredient: null, strength: null, form: null, route: null, atc_code: null },
  ];
  const questionnaireMap: Row[] = [
    ['DLQI', 'DLQI – Dermatology Life Quality Index', 'castellano (10 ítems) – licencia pendiente'],
    ['EQ5D_5L', 'EQ-5D-5L', 'heredado IRIS – pendiente de validar'],
    ['EVASAF', 'EVASAF – Satisfacción', 'Farm Hosp 2015;39(3):152-6 (10 ítems)'],
    ['IEXPAC', 'IEXPAC – Experiencia del paciente crónico', 'IEXPAC ©2015 castellano (15 ítems)'],
    ['MORISKY_GREEN', 'Morisky-Green (4 ítems)', 'heredado IRIS – pendiente de validar'],
    ['PAM10', 'PAM-10', 'heredado IRIS – pendiente de validar'],
  ].map(([code, label, version], i) => ({ questionnaire_code: code, measurement_id: uuid(8, i + 1), label, instrument_version: version, is_active: true }));
  const measurementOf = (code: string) => questionnaireMap.find((m) => m.questionnaire_code === code)!.measurement_id;

  let vSeq = 0;
  let qSeq = 0;
  let iSeq = 0;
  let mSeq = 0;
  let eSeq = 0;
  let sSeq = 0;
  let itSeq = 0;
  const types = ['baseline', 'month_3', 'month_6', 'month_9', 'month_12'];

  for (let p = 1; p <= options.patients; p += 1) {
    const center = centers[p % 2];
    const pid = uuid(2, p);
    const inclusion = `2026-${String(1 + (p % 9)).padStart(2, '0')}-${String(1 + (p % 27)).padStart(2, '0')}`;
    patients.push({
      id: pid,
      study_code: `DPX-0${center.study_number}-${String(p).padStart(4, '0')}`,
      center_id: center.id,
      center_seq: p,
      inclusion_date: maybe(inclusion, 0.05),
      screening_date: maybe(inclusion, 0.3),
      age_at_inclusion: maybe(18 + Math.floor(r() * 70), 0.05),
      sex: maybe(pick(['female', 'male', 'other', 'unknown'])),
      consent_signed: r() > 0.02,
      created_at: `2026-01-01T10:00:${String(p % 60).padStart(2, '0')}.123456+00:00`,
      updated_at: '2026-10-01T08:30:00+00:00',
    });
    if (p % 3 === 0) {
      consents.push({ id: uuid(3, p), patient_id: pid, consent_type: 'estudio', document_version: '1.0', status: 'granted', granted_at: '2026-01-02T09:00:00+00:00', revoked_at: null, notes: pick(TRICKY_TEXTS), created_at: '2026-01-02T09:00:00+00:00', updated_at: '2026-01-02T09:00:00+00:00' });
    }
    const med = { id: uuid(6, (mSeq += 1)), patient_id: pid, medication_catalog_id: pick(medicationCatalog).id, catalog_concept_id: null, catalog_product_id: null, selection_source: 'internal', selected_label_snapshot: 'Snapshot «etiqueta», con coma', dose_text: '300 mg', frequency_text: 'cada 14 días', route_text: 'SC', indication: 'Dermatitis atópica', start_date: '2026-01-01', end_date: p % 4 === 0 ? '2026-06-30' : null, is_active: p % 4 !== 0 && p % 7 !== 0, notes: maybe(pick(TRICKY_TEXTS), 0.5), created_at: '2026-01-01T00:00:00+00:00', updated_at: '2026-01-01T00:00:00+00:00' };
    patientMedications.push(med);

    const nVisits = 1 + (p % 5);
    for (let k = 0; k < nVisits; k += 1) {
      const vid = uuid(4, (vSeq += 1));
      const type = types[k];
      const done = k < nVisits - 1 || p % 2 === 0;
      const status = p % 11 === 0 && k === 1 ? 'cancelled' : done ? 'completed' : 'scheduled';
      const month = 1 + (p % 9) + k * 3;
      const date = `${month > 12 ? 2027 : 2026}-${String(((month - 1) % 12) + 1).padStart(2, '0')}-15`;
      visits.push({
        id: vid, patient_id: pid, visit_type: type, visit_number: k + 1, scheduled_date: date,
        visit_date: status === 'completed' ? date : null, visit_status: status,
        extraordinary_reason: null, notes: maybe(pick(TRICKY_TEXTS), 0.6),
        created_at: `2026-02-0${1 + (k % 8)}T12:00:00+00:00`, updated_at: '2026-10-01T08:30:00+00:00',
      });
      if (status !== 'completed') continue;

      // Cuestionarios en basal y mes 12 (calendario actual).
      if (type === 'baseline' || type === 'month_12') {
        const iexpac: Record<string, number> = {};
        for (let q = 1; q <= 11; q += 1) iexpac[`q${q}`] = 1 + Math.floor(r() * 5);
        if (p % 2 === 0) iexpac.q12 = 1 + Math.floor(r() * 5);
        const add = (code: string, responses: Row) =>
          questionnaires.push({ id: uuid(5, (qSeq += 1)), visit_id: vid, questionnaire_code: code, measurement_id: measurementOf(code), responses, created_at: '2026-03-01T00:00:00+00:00', updated_at: '2026-03-01T00:00:00+00:00' });
        add('IEXPAC', iexpac);
        const dlqi: Row = {};
        for (let q = 1; q <= 10; q += 1) dlqi[`q${q}`] = q === 7 ? pick(['yes', 'no']) : Math.floor(r() * 4);
        if (dlqi.q7 === 'no') dlqi.q7b = Math.floor(r() * 3);
        add('DLQI', dlqi);
        const evasaf: Row = {};
        for (let q = 1; q <= 10; q += 1) evasaf[`q${q}`] = 1 + Math.floor(r() * 5);
        add('EVASAF', evasaf);
        add('EQ5D_5L', { mobility: 1, selfcare: 2, activities: 1, pain: 3, anxiety: 2, vas: 72.5, profile: '12132' });
        const pam: Row = {};
        for (let q = 1; q <= 10; q += 1) pam[`q${q}`] = 1 + Math.floor(r() * 4);
        add('PAM10', pam);
        add('MORISKY_GREEN', { q1: r() > 0.5, q2: true, q3: false, q4: r() > 0.7 });
      }

      const nInt = options.interventionsPerVisit ?? 2;
      for (let n = 0; n < nInt; n += 1) {
        const standard = center.study_arm === 'standard';
        interventions.push({
          id: uuid(7, (iSeq += 1)), visit_id: vid, intervention_type: standard && n === 0 && p % 5 === 0 ? 'Sin intervención en esta visita' : `Intervención ${n + 1}: «educación», técnica de inyección`,
          intervention_domain: standard ? null : pick(['Capacidad', 'Motivación', 'Oportunidad']), priority_level: maybe(pick(['low', 'medium', 'high'])),
          delivered: maybe(r() > 0.2), linked_to_cmo_level: standard ? null : maybe(1 + Math.floor(r() * 3)), outcome: maybe(pick(TRICKY_TEXTS)), notes: maybe(pick(TRICKY_TEXTS)),
          catalog_item_id: null, catalog_code: standard ? null : `C${n}`, catalog_version: standard ? null : 'v1-draft',
          usual_care_item_id: null, usual_care_code: standard ? (n === 0 && p % 5 === 0 ? 'sin-intervencion' : `af-${n}`) : null, usual_care_version: standard ? 'af-0.1' : null,
          created_at: '2026-03-01T00:00:00+00:00', updated_at: '2026-03-01T00:00:00+00:00',
        });
      }
      medicationEvents.push({ id: uuid(10, (eSeq += 1)), visit_id: vid, patient_medication_id: med.id, event_type: k === 0 ? 'added' : 'confirmed_no_change', old_value: null, new_value: { dose_text: '300 mg', nota: 'línea\ncon "comillas"' }, created_at: '2026-03-01T00:00:00+00:00' });
      if (p % 6 === 0 && k === 0) documents.push({ id: uuid(11, p), visit_id: vid, document_type: 'lab_report', mime_type: 'application/pdf', file_size: 123456, notes: null, created_at: '2026-03-01T00:00:00+00:00', updated_at: '2026-03-01T00:00:00+00:00' });

      if (center.study_arm === 'cmo' && (type === 'baseline' || type === 'month_6' || type === 'month_12')) {
        const sid = uuid(12, (sSeq += 1));
        cmoRegistry.push({
          id: sid, visit_id: vid, patient_id: pid, center_id: center.id, study_arm: 'cmo', visit_type: type, visit_number: k + 1, visit_date: date, scheduled_date: date,
          stratification_reason: type, engine_version: 'cmo-dermapex-1.0.0+src.227e444', model_version: 'cmo-derma-model-1.0.0+src.227e444',
          incomplete: p % 8 === 0, unknown_count: p % 8 === 0 ? 1 : 0, unknown_variables: p % 8 === 0 ? ['tabaquismo'] : [],
          created_at: '2026-03-01T00:00:00+00:00', updated_at: '2026-03-02T00:00:00+00:00', results_visible: true,
          score: Number((r() * 30).toFixed(2)), priority: 1 + Math.floor(r() * 3), special_rule_applied: false,
          block_scores: CMO_BLOCKS.map((b) => ({ block: b.id, points: Math.floor(r() * 5) })),
        });
        for (const [i, field] of [{ code: AGE_GROUP_CODE }, ...CMO_ANSWER_FIELDS.slice(0, 5)].entries()) {
          cmoItems.push({ id: uuid(13, (itSeq += 1)), cmo_score_id: sid, visit_id: vid, variable_code: field.code, label: `Variable ${field.code}`, block: 'clinica', sort_order: i, is_scored: true, model_version: 'cmo-derma-model-1.0.0+src.227e444', raw_value: field.code === AGE_GROUP_CODE ? { value: 'adulto', age: 40 } : { value: pick(['si', 'no', 'unknown']) }, item_score: Math.floor(r() * 3) });
        }
      }
    }
  }

  return { centers, patients, consents, visits, questionnaireMap, questionnaires, interventions, medicationCatalog, patientMedications, medicationEvents, documents, cmoRegistry, cmoItems };
}

export type MemorySourceOptions = {
  /** Límite de filas por petición del «servidor» (PostgREST max-rows). */
  serverMaxRows?: number;
  /** Simula un fallo: devuelve como máximo N filas en total para esta tabla (corte silencioso). */
  truncateTable?: { table: string; maxTotal: number };
  /** Simula una inserción concurrente en esta tabla durante la lectura. */
  mutateTable?: string;
  /** Simula un orden inestable entre páginas (paginación incorrecta). */
  unstableOrderTable?: string;
};

const TABLE_TO_KEY = Object.fromEntries(Object.entries(TABLE_REQUESTS).map(([k, v]) => [v.table, k])) as Record<string, TableKey>;

export function memorySource(data: RawData, options: MemorySourceOptions = {}): DataSource {
  const tables: Record<string, Row[]> = {};
  for (const [table, key] of Object.entries(TABLE_TO_KEY)) tables[table] = [...data[key]];
  let mutated = false;
  return {
    async count(table) {
      return tables[table].length;
    },
    async page(request: TableRequest, from: number, to: number) {
      const columns = request.columns.split(',');
      let rows = [...tables[request.table]].sort((a, b) => String(a[request.orderBy]).localeCompare(String(b[request.orderBy])));
      if (options.unstableOrderTable === request.table && from > 0) rows = rows.reverse();
      if (options.truncateTable?.table === request.table) rows = rows.slice(0, options.truncateTable.maxTotal);
      const limit = Math.min(to - from + 1, options.serverMaxRows ?? Number.MAX_SAFE_INTEGER);
      const pageRows = rows.slice(from, from + limit).map((row) => Object.fromEntries(columns.map((col) => [col, row[col] ?? null])));
      if (options.mutateTable === request.table && !mutated) {
        mutated = true;
        tables[request.table].push({ ...tables[request.table][0], id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });
      }
      return pageRows;
    },
  };
}
