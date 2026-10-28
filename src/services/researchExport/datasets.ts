// Construcción de los conjuntos exportados a partir de las tablas leídas (función pura, sin red).
//
// · raw/: cada tabla clínica tal cual está almacenada (mismas columnas y valores), para reconstruir la
//   base de datos y auditar. Se excluyen solo columnas técnicas o con riesgo de identificación (ver
//   EXCLUDED_COLUMNS), documentadas en el manifiesto.
// · analisis/: conjuntos para el análisis estadístico (LONG, WIDE, ítems de cuestionarios,
//   estratificaciones CMO, medicación por visita, incidencias de integridad).
//
// Identificadores: study_code (código seudonimizado del estudio, estable) para el paciente y el UUID de
// cada registro para el resto. No se generan seudónimos secuenciales (cambiarían entre extracciones).

import { SEX_TYPE_OPTIONS, VISIT_STATUS_OPTIONS, VISIT_TYPE_OPTIONS } from '../../constants/enums';
import type { StratificationItemValueRow, StratificationRegistryRow } from '../cmoStratificationService';
import { deriveQuestionnaireScores, normalizeQuestionnaireCode, type QuestionnaireType } from '../questionnaireDomain';
import { buildStratificationExportRows, stratificationSpssDictionary } from '../stratificationExport';
import type { TableRequest } from './reader';
import type { ColumnSpec, ColumnType, Dataset } from './spec';

/** Versión de las reglas de puntuación de cuestionarios aplicadas (src/services/questionnaireDomain.ts). */
export const QUESTIONNAIRE_SCORING_VERSION = 'dermapex-pro-scoring-0.1 (provisional, pendiente de validar con los manuales oficiales)';

const USUAL_CARE_NO_INTERVENTION_CODE = 'sin-intervencion';

// ── Tablas a leer ──────────────────────────────────────────────────────────

export const TABLE_REQUESTS = {
  centers: { table: 'centers', columns: 'id,code,name,study_arm,study_number,is_active', orderBy: 'id' },
  patients: {
    table: 'patients',
    columns: 'id,study_code,center_id,center_seq,inclusion_date,screening_date,age_at_inclusion,sex,consent_signed,created_at,updated_at',
    orderBy: 'id',
  },
  consents: {
    table: 'consents',
    columns: 'id,patient_id,consent_type,document_version,status,granted_at,revoked_at,notes,created_at,updated_at',
    orderBy: 'id',
  },
  visits: {
    table: 'visits',
    columns: 'id,patient_id,visit_type,visit_number,scheduled_date,visit_date,visit_status,extraordinary_reason,notes,created_at,updated_at',
    orderBy: 'id',
  },
  questionnaireMap: { table: 'questionnaire_measurement_map', columns: 'questionnaire_code,measurement_id,label,instrument_version,is_active', orderBy: 'questionnaire_code' },
  questionnaires: { table: 'questionnaire_responses', columns: 'id,visit_id,questionnaire_code,measurement_id,responses,created_at,updated_at', orderBy: 'id' },
  interventions: {
    table: 'interventions',
    columns:
      'id,visit_id,intervention_type,intervention_domain,priority_level,delivered,linked_to_cmo_level,outcome,notes,catalog_item_id,catalog_code,catalog_version,usual_care_item_id,usual_care_code,usual_care_version,created_at,updated_at',
    orderBy: 'id',
  },
  medicationCatalog: { table: 'medication_catalog', columns: 'id,source,source_code,display_name,active_ingredient,strength,form,route,atc_code', orderBy: 'id' },
  patientMedications: {
    table: 'patient_medications',
    columns:
      'id,patient_id,medication_catalog_id,catalog_concept_id,catalog_product_id,selection_source,selected_label_snapshot,dose_text,frequency_text,route_text,indication,start_date,end_date,is_active,notes,created_at,updated_at',
    orderBy: 'id',
  },
  medicationEvents: { table: 'visit_medication_events', columns: 'id,visit_id,patient_medication_id,event_type,old_value,new_value,created_at', orderBy: 'id' },
  documents: { table: 'visit_documents', columns: 'id,visit_id,document_type,mime_type,file_size,notes,created_at,updated_at', orderBy: 'id' },
  // Vistas con filtro de acceso y enmascaramiento por cohorte (D5).
  cmoRegistry: {
    table: 'cmo_stratification_registry',
    columns:
      'id,visit_id,patient_id,center_id,study_arm,visit_type,visit_number,visit_date,scheduled_date,stratification_reason,engine_version,model_version,incomplete,unknown_count,unknown_variables,created_at,updated_at,results_visible,score,priority,special_rule_applied,block_scores',
    orderBy: 'id',
  },
  cmoItems: {
    table: 'cmo_stratification_item_values',
    columns: 'id,cmo_score_id,visit_id,variable_code,label,block,sort_order,is_scored,model_version,raw_value,item_score',
    orderBy: 'id',
  },
} satisfies Record<string, TableRequest>;

export type TableKey = keyof typeof TABLE_REQUESTS;

/** Columnas de la base de datos que NO se exportan, con motivo (se listan en el manifiesto). */
export const EXCLUDED_COLUMNS: Array<{ table: string; columns: string; reason: string }> = [
  { table: '(todas)', columns: 'created_by, calculated_by, delivered_by, user_id, obtained_by, uploaded_by, scored_by', reason: 'Identificador del profesional: no es una variable del estudio (consta en audit_log).' },
  { table: 'patient_medications', columns: 'selected_source_payload', reason: 'Copia técnica del registro de CIMA/catálogo; no es dato clínico.' },
  { table: 'visit_documents', columns: 'original_file_name, stored_file_path', reason: 'El nombre de fichero puede contener identificadores directos del paciente. Los PDF no se exportan.' },
  { table: 'cmo_scores', columns: 'factors, recommendations', reason: 'Se exporta la estratificación desde la vista enmascarada por cohorte (cmo_stratification_registry).' },
];

type Row = Record<string, unknown>;

export type RawData = Record<TableKey, Row[]>;

// ── Diccionarios de valores ───────────────────────────────────────────────

const toValueMap = (options: ReadonlyArray<{ value: string; label: string }>) =>
  Object.fromEntries(options.map((o) => [o.value, o.label]));

const VISIT_TYPE_VALUES = toValueMap(VISIT_TYPE_OPTIONS);
const VISIT_STATUS_VALUES = toValueMap(VISIT_STATUS_OPTIONS);
const SEX_VALUES = toValueMap(SEX_TYPE_OPTIONS);
const ARM_VALUES = { cmo: 'Cohorte de intervención CMO-MAPEX', standard: 'Cohorte de atención farmacéutica estándar' };
const YES_NO = { '1': 'Sí', '0': 'No' };
// Opciones de respuesta de IEXPAC tal como se muestran en el formulario (VisitQuestionnairesPage.tsx, LIKERT_LABELS).
const IEXPAC_ANSWER_LABELS = { '1': 'Nunca', '2': 'Casi nunca', '3': 'A veces', '4': 'Casi siempre', '5': 'Siempre' };

// Columnas reutilizables.
const c = (name: string, label: string, type: ColumnType, source: string, extra: Partial<ColumnSpec> = {}): ColumnSpec => ({ name, label, type, source, ...extra });
const createdAt = (table: string) => c('created_at', 'Fecha y hora de creación del registro (UTC)', 'datetime', `${table}.created_at`, { definition: 'Momento de introducción del dato; no es la fecha clínica.' });
const updatedAt = (table: string) => c('updated_at', 'Fecha y hora de la última modificación (UTC)', 'datetime', `${table}.updated_at`);

// ── Visitas: posiciones del calendario para el formato WIDE ───────────────

export const VISIT_SLOTS: Array<{ type: string; suffix: string; label: string }> = [
  { type: 'baseline', suffix: 'v0', label: 'basal' },
  { type: 'month_3', suffix: 'v3', label: 'mes 3' },
  { type: 'month_6', suffix: 'v6', label: 'mes 6' },
  { type: 'month_9', suffix: 'v9', label: 'mes 9' },
  { type: 'month_12', suffix: 'v12', label: 'mes 12' },
];

// ── Instrumentos y métricas derivadas ─────────────────────────────────────

type Metric = { suffix: string; label: string; type: ColumnType; pick: 'total' | 'secondary' | 'profile'; rule: string; values?: Record<string, string> };

export const INSTRUMENTS: Array<{ code: string; type: QuestionnaireType; prefix: string; name: string; metrics: Metric[] }> = [
  {
    code: 'IEXPAC', type: 'iexpac', prefix: 'iexpac', name: 'IEXPAC',
    metrics: [
      { suffix: 'total', label: 'IEXPAC puntuación global (0-10)', type: 'decimal', pick: 'total', rule: '10·(Σ ítems 1-11 − 11)/44, redondeo a 2 decimales; vacío si falta algún ítem 1-11 (PROVISIONAL, verificar con el manual).' },
      { suffix: 'item12', label: 'IEXPAC ítem 12 (tras alta hospitalaria, 1-5)', type: 'integer', pick: 'secondary', rule: 'Valor bruto del ítem 12; no entra en la puntuación global.' },
    ],
  },
  {
    code: 'DLQI', type: 'dlqi', prefix: 'dlqi', name: 'DLQI',
    metrics: [
      { suffix: 'total', label: 'DLQI total (0-30)', type: 'integer', pick: 'total', rule: 'Suma de ítems (0-3); «Sin relación» = 0; ítem 7 «impide» = 3; 1 ítem sin contestar = 0; con 2 o más sin contestar no se puntúa (src/services/dlqi.ts).' },
      { suffix: 'sin_contestar', label: 'DLQI número de ítems sin contestar', type: 'integer', pick: 'secondary', rule: 'Recuento de ítems sin respuesta.' },
    ],
  },
  {
    code: 'EVASAF', type: 'evasaf', prefix: 'evasaf', name: 'EVASAF',
    metrics: [
      { suffix: 'media', label: 'EVASAF media de los 10 ítems (1-5)', type: 'decimal', pick: 'total', rule: 'Media de los 10 ítems (PROVISIONAL: el artículo no define puntuación total).' },
      { suffix: 'suma', label: 'EVASAF suma de los 10 ítems (10-50)', type: 'integer', pick: 'secondary', rule: 'Suma de los 10 ítems.' },
    ],
  },
  {
    code: 'EQ5D_5L', type: 'eq5d', prefix: 'eq5d', name: 'EQ-5D-5L',
    metrics: [
      { suffix: 'eva', label: 'EQ-5D-5L escala visual analógica (0-100)', type: 'decimal', pick: 'secondary', rule: 'Valor de la EVA tal como se registró.' },
      { suffix: 'perfil', label: 'EQ-5D-5L perfil de salud (5 dígitos)', type: 'string', pick: 'profile', rule: 'Concatenación de los 5 niveles registrada en la visita. Sin índice de utilidad (requiere tabla de valores española).' },
    ],
  },
  {
    code: 'PAM10', type: 'pam10', prefix: 'pam10', name: 'PAM-10',
    metrics: [{ suffix: 'suma', label: 'PAM-10 puntuación bruta (10-50)', type: 'integer', pick: 'total', rule: 'Suma de 10 ítems 1-5; vacío si falta alguno. Sin conversión a escala 0-100 (requiere licencia).' }],
  },
  {
    code: 'MORISKY_GREEN', type: 'morisky', prefix: 'morisky', name: 'Morisky-Green',
    metrics: [{ suffix: 'adherente', label: 'Morisky-Green adherente', type: 'boolean', pick: 'total', rule: 'Adherente si ítem 1 = No, 2 = Sí, 3 = No, 4 = No (regla heredada, PENDIENTE de validar).', values: YES_NO }],
  },
];

// ── Utilidades ────────────────────────────────────────────────────────────

const ITEM_COLLATOR = new Intl.Collator('es', { numeric: true });
function naturalItemOrder(a: string, b: string): number {
  return ITEM_COLLATOR.compare(a, b);
}

function daysBetween(fromIso: string | null | undefined, toIso: string | null | undefined): number | null {
  if (!fromIso || !toIso) return null;
  const [y1, m1, d1] = fromIso.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = toIso.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function asNumberOrBoolean(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}

function itemText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function isAnswered(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

export type IntegrityIssue = {
  tipo: string;
  gravedad: 'error' | 'revisar';
  tabla: string;
  registro_id: string | null;
  study_code: string | null;
  detalle: string;
};

export type BuildResult = { datasets: Dataset[]; issues: IntegrityIssue[] };

// ── Construcción ──────────────────────────────────────────────────────────

export function buildDatasets(raw: RawData, todayIso: string): BuildResult {
  const issues: IntegrityIssue[] = [];
  const centerById = new Map(raw.centers.map((r) => [r.id as string, r]));
  const patientById = new Map(raw.patients.map((r) => [r.id as string, r]));
  const visitById = new Map(raw.visits.map((r) => [r.id as string, r]));
  const mapByCode = new Map(raw.questionnaireMap.map((r) => [r.questionnaire_code as string, r]));
  const catalogById = new Map(raw.medicationCatalog.map((r) => [r.id as string, r]));

  const studyCodeOfPatient = (patientId: unknown) => (patientById.get(patientId as string)?.study_code as string | undefined) ?? null;
  const studyCodeOfVisit = (visitId: unknown) => studyCodeOfPatient(visitById.get(visitId as string)?.patient_id);
  const centerOfPatient = (patientId: unknown) => centerById.get(patientById.get(patientId as string)?.center_id as string);

  // Integridad referencial dentro de la extracción.
  for (const p of raw.patients) {
    if (!centerById.has(p.center_id as string)) issues.push({ tipo: 'centro_no_exportado', gravedad: 'error', tabla: 'patients', registro_id: p.id as string, study_code: p.study_code as string, detalle: 'El centro del paciente no está en la extracción.' });
  }
  const checkVisitRef = (table: string, rows: Row[]) => {
    for (const r of rows) {
      if (!visitById.has(r.visit_id as string)) issues.push({ tipo: 'registro_huerfano', gravedad: 'error', tabla: table, registro_id: r.id as string, study_code: null, detalle: 'La visita referenciada no está en la extracción.' });
    }
  };
  for (const v of raw.visits) {
    const p = patientById.get(v.patient_id as string);
    if (!p) {
      issues.push({ tipo: 'registro_huerfano', gravedad: 'error', tabla: 'visits', registro_id: v.id as string, study_code: null, detalle: 'El paciente de la visita no está en la extracción.' });
      continue;
    }
    const visitDate = v.visit_date as string | null;
    if (visitDate && visitDate > todayIso) issues.push({ tipo: 'fecha_futura', gravedad: 'revisar', tabla: 'visits', registro_id: v.id as string, study_code: p.study_code as string, detalle: `Fecha de visita realizada posterior a la fecha de extracción (${visitDate}).` });
    if (visitDate && p.inclusion_date && visitDate < (p.inclusion_date as string) && v.visit_type !== 'baseline') {
      issues.push({ tipo: 'cronologia', gravedad: 'revisar', tabla: 'visits', registro_id: v.id as string, study_code: p.study_code as string, detalle: `Visita ${String(v.visit_type)} anterior a la fecha de inclusión (${visitDate} < ${String(p.inclusion_date)}).` });
    }
    if (v.visit_status === 'completed' && !visitDate) issues.push({ tipo: 'dato_incompleto', gravedad: 'revisar', tabla: 'visits', registro_id: v.id as string, study_code: p.study_code as string, detalle: 'Visita completada sin fecha de realización.' });
  }
  checkVisitRef('questionnaire_responses', raw.questionnaires);
  checkVisitRef('interventions', raw.interventions);
  checkVisitRef('visit_medication_events', raw.medicationEvents);
  checkVisitRef('visit_documents', raw.documents);
  for (const m of raw.patientMedications) {
    if (!patientById.has(m.patient_id as string)) issues.push({ tipo: 'registro_huerfano', gravedad: 'error', tabla: 'patient_medications', registro_id: m.id as string, study_code: null, detalle: 'El paciente de la medicación no está en la extracción.' });
  }
  for (const q of raw.questionnaires) {
    if (!normalizeQuestionnaireCode(q.questionnaire_code)) issues.push({ tipo: 'instrumento_desconocido', gravedad: 'error', tabla: 'questionnaire_responses', registro_id: q.id as string, study_code: studyCodeOfVisit(q.visit_id), detalle: `Código de cuestionario sin regla de puntuación: ${String(q.questionnaire_code)}.` });
  }

  // Visitas activas duplicadas por tipo (no debería ocurrir desde la migración 20261028120000).
  const activeByPatientType = new Map<string, Row[]>();
  for (const v of raw.visits) {
    if (v.visit_type === 'extra' || v.visit_status === 'cancelled') continue;
    const key = `${String(v.patient_id)}|${String(v.visit_type)}`;
    activeByPatientType.set(key, [...(activeByPatientType.get(key) ?? []), v]);
  }
  for (const list of activeByPatientType.values()) {
    if (list.length > 1) {
      issues.push({ tipo: 'visita_duplicada', gravedad: 'error', tabla: 'visits', registro_id: list.map((v) => v.id).join('|'), study_code: studyCodeOfPatient(list[0].patient_id), detalle: `${list.length} visitas activas de tipo ${String(list[0].visit_type)}.` });
    }
  }

  // ── RAW ──
  const rawDatasets: Dataset[] = [
    {
      id: 'centros', folder: 'raw', title: 'Centros participantes', grain: 'Un centro', key: ['id'],
      columns: [
        c('id', 'Identificador del centro (UUID)', 'string', 'centers.id'),
        c('code', 'Código del centro', 'string', 'centers.code'),
        c('name', 'Nombre del centro', 'string', 'centers.name'),
        c('study_arm', 'Cohorte del centro', 'string', 'centers.study_arm', { values: ARM_VALUES }),
        c('study_number', 'Número de centro en el código de paciente', 'integer', 'centers.study_number'),
        c('is_active', 'Centro activo', 'boolean', 'centers.is_active', { values: YES_NO }),
      ],
      rows: raw.centers,
    },
    {
      id: 'pacientes', folder: 'raw', title: 'Pacientes (seudonimizados)', grain: 'Un paciente', key: ['id'],
      columns: [
        c('id', 'Identificador interno del paciente (UUID)', 'string', 'patients.id'),
        c('study_code', 'Código de estudio del paciente', 'string', 'patients.study_code', { definition: 'Código seudonimizado asignado por la base de datos (DPX-<centro>-<n>).' }),
        c('center_id', 'Identificador del centro (UUID)', 'string', 'patients.center_id'),
        c('center_seq', 'Correlativo del paciente en el centro', 'integer', 'patients.center_seq'),
        c('inclusion_date', 'Fecha de inclusión', 'date', 'patients.inclusion_date'),
        c('screening_date', 'Fecha de cribado', 'date', 'patients.screening_date'),
        c('age_at_inclusion', 'Edad en la inclusión', 'integer', 'patients.age_at_inclusion', { unit: 'años' }),
        c('sex', 'Sexo', 'string', 'patients.sex', { values: SEX_VALUES }),
        c('consent_signed', 'Consentimiento informado firmado', 'boolean', 'patients.consent_signed', { values: YES_NO }),
        createdAt('patients'),
        updatedAt('patients'),
      ],
      rows: raw.patients,
    },
    {
      id: 'consentimientos', folder: 'raw', title: 'Consentimientos', grain: 'Un registro de consentimiento', key: ['id'],
      columns: [
        c('id', 'Identificador del consentimiento (UUID)', 'string', 'consents.id'),
        c('patient_id', 'Identificador del paciente (UUID)', 'string', 'consents.patient_id'),
        c('consent_type', 'Tipo de consentimiento', 'string', 'consents.consent_type'),
        c('document_version', 'Versión de la HIP/CI', 'string', 'consents.document_version'),
        c('status', 'Estado', 'string', 'consents.status', { values: { granted: 'Otorgado', revoked: 'Revocado', pending: 'Pendiente' } }),
        c('granted_at', 'Fecha y hora de otorgamiento', 'datetime', 'consents.granted_at'),
        c('revoked_at', 'Fecha y hora de revocación', 'datetime', 'consents.revoked_at'),
        c('notes', 'Observaciones', 'string', 'consents.notes'),
        createdAt('consents'),
        updatedAt('consents'),
      ],
      rows: raw.consents,
    },
    {
      id: 'visitas', folder: 'raw', title: 'Visitas', grain: 'Una visita', key: ['id'],
      columns: [
        c('id', 'Identificador de la visita (UUID)', 'string', 'visits.id'),
        c('patient_id', 'Identificador del paciente (UUID)', 'string', 'visits.patient_id'),
        c('visit_type', 'Tipo de visita', 'string', 'visits.visit_type', { values: VISIT_TYPE_VALUES }),
        c('visit_number', 'Número de visita del calendario', 'integer', 'visits.visit_number'),
        c('scheduled_date', 'Fecha programada', 'date', 'visits.scheduled_date'),
        c('visit_date', 'Fecha de realización', 'date', 'visits.visit_date'),
        c('visit_status', 'Estado de la visita', 'string', 'visits.visit_status', { values: VISIT_STATUS_VALUES }),
        c('extraordinary_reason', 'Motivo de la visita extraordinaria', 'string', 'visits.extraordinary_reason'),
        c('notes', 'Notas de la visita', 'string', 'visits.notes'),
        createdAt('visits'),
        updatedAt('visits'),
      ],
      rows: raw.visits,
    },
    {
      id: 'cuestionarios_catalogo', folder: 'raw', title: 'Instrumentos habilitados', grain: 'Un instrumento', key: ['questionnaire_code'],
      columns: [
        c('questionnaire_code', 'Código del instrumento', 'string', 'questionnaire_measurement_map.questionnaire_code'),
        c('measurement_id', 'Identificador de medida (UUID)', 'string', 'questionnaire_measurement_map.measurement_id'),
        c('label', 'Nombre del instrumento', 'string', 'questionnaire_measurement_map.label'),
        c('instrument_version', 'Versión del instrumento', 'string', 'questionnaire_measurement_map.instrument_version'),
        c('is_active', 'Instrumento activo', 'boolean', 'questionnaire_measurement_map.is_active', { values: YES_NO }),
      ],
      rows: raw.questionnaireMap,
    },
    {
      id: 'cuestionarios_registros', folder: 'raw', title: 'Respuestas a cuestionarios (registro original)', grain: 'Un cuestionario administrado en una visita', key: ['id'],
      columns: [
        c('id', 'Identificador del registro (UUID)', 'string', 'questionnaire_responses.id'),
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'questionnaire_responses.visit_id'),
        c('questionnaire_code', 'Código del instrumento', 'string', 'questionnaire_responses.questionnaire_code'),
        c('measurement_id', 'Identificador de medida (UUID)', 'string', 'questionnaire_responses.measurement_id'),
        c('responses', 'Respuestas originales (JSON)', 'json', 'questionnaire_responses.responses', { definition: 'Objeto JSON tal como está almacenado. Desglose por ítem en analisis/cuestionarios_items.' }),
        createdAt('questionnaire_responses'),
        updatedAt('questionnaire_responses'),
      ],
      rows: raw.questionnaires,
    },
    {
      id: 'intervenciones', folder: 'raw', title: 'Intervenciones farmacéuticas', grain: 'Una intervención registrada en una visita', key: ['id'],
      columns: [
        c('id', 'Identificador de la intervención (UUID)', 'string', 'interventions.id'),
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'interventions.visit_id'),
        c('intervention_type', 'Intervención', 'string', 'interventions.intervention_type'),
        c('intervention_domain', 'Pilar CMO (cohorte CMO)', 'string', 'interventions.intervention_domain'),
        c('priority_level', 'Prioridad', 'string', 'interventions.priority_level', { values: { low: 'Baja', medium: 'Media', high: 'Alta' } }),
        c('delivered', 'Intervención realizada', 'boolean', 'interventions.delivered', { values: YES_NO }),
        c('linked_to_cmo_level', 'Nivel CMO vinculado', 'integer', 'interventions.linked_to_cmo_level'),
        c('outcome', 'Resultado', 'string', 'interventions.outcome'),
        c('notes', 'Notas', 'string', 'interventions.notes'),
        c('catalog_item_id', 'Ítem del catálogo CMO (UUID)', 'string', 'interventions.catalog_item_id'),
        c('catalog_code', 'Código del catálogo CMO', 'string', 'interventions.catalog_code'),
        c('catalog_version', 'Versión del catálogo CMO', 'string', 'interventions.catalog_version'),
        c('usual_care_item_id', 'Actividad de AF estándar (UUID)', 'string', 'interventions.usual_care_item_id'),
        c('usual_care_code', 'Código de actividad de AF estándar', 'string', 'interventions.usual_care_code', { notes: `«${USUAL_CARE_NO_INTERVENTION_CODE}» = se registró expresamente que no hubo intervención.` }),
        c('usual_care_version', 'Versión del listado de AF estándar', 'string', 'interventions.usual_care_version'),
        createdAt('interventions'),
        updatedAt('interventions'),
      ],
      rows: raw.interventions,
    },
    {
      id: 'catalogo_medicamentos', folder: 'raw', title: 'Catálogo de medicamentos', grain: 'Un medicamento del catálogo', key: ['id'],
      columns: [
        c('id', 'Identificador del medicamento (UUID)', 'string', 'medication_catalog.id'),
        c('source', 'Origen del catálogo', 'string', 'medication_catalog.source'),
        c('source_code', 'Código en el origen', 'string', 'medication_catalog.source_code'),
        c('display_name', 'Nombre', 'string', 'medication_catalog.display_name'),
        c('active_ingredient', 'Principio activo', 'string', 'medication_catalog.active_ingredient'),
        c('strength', 'Dosis', 'string', 'medication_catalog.strength'),
        c('form', 'Forma farmacéutica', 'string', 'medication_catalog.form'),
        c('route', 'Vía', 'string', 'medication_catalog.route'),
        c('atc_code', 'Código ATC', 'string', 'medication_catalog.atc_code'),
      ],
      rows: raw.medicationCatalog,
    },
    {
      id: 'medicacion_paciente', folder: 'raw', title: 'Tratamientos del paciente', grain: 'Un tratamiento', key: ['id'],
      columns: [
        c('id', 'Identificador del tratamiento (UUID)', 'string', 'patient_medications.id'),
        c('patient_id', 'Identificador del paciente (UUID)', 'string', 'patient_medications.patient_id'),
        c('medication_catalog_id', 'Medicamento del catálogo (UUID)', 'string', 'patient_medications.medication_catalog_id'),
        c('catalog_concept_id', 'Concepto normalizado (UUID)', 'string', 'patient_medications.catalog_concept_id'),
        c('catalog_product_id', 'Producto normalizado (UUID)', 'string', 'patient_medications.catalog_product_id'),
        c('selection_source', 'Origen de la selección', 'string', 'patient_medications.selection_source'),
        c('selected_label_snapshot', 'Nombre tal como se seleccionó', 'string', 'patient_medications.selected_label_snapshot'),
        c('dose_text', 'Dosis', 'string', 'patient_medications.dose_text'),
        c('frequency_text', 'Frecuencia', 'string', 'patient_medications.frequency_text'),
        c('route_text', 'Vía', 'string', 'patient_medications.route_text'),
        c('indication', 'Indicación', 'string', 'patient_medications.indication'),
        c('start_date', 'Fecha de inicio', 'date', 'patient_medications.start_date'),
        c('end_date', 'Fecha de fin', 'date', 'patient_medications.end_date'),
        c('is_active', 'Tratamiento activo actualmente', 'boolean', 'patient_medications.is_active', { values: YES_NO }),
        c('notes', 'Notas', 'string', 'patient_medications.notes'),
        createdAt('patient_medications'),
        updatedAt('patient_medications'),
      ],
      rows: raw.patientMedications,
    },
    {
      id: 'medicacion_eventos', folder: 'raw', title: 'Cambios de tratamiento por visita', grain: 'Un evento de medicación en una visita', key: ['id'],
      columns: [
        c('id', 'Identificador del evento (UUID)', 'string', 'visit_medication_events.id'),
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'visit_medication_events.visit_id'),
        c('patient_medication_id', 'Identificador del tratamiento (UUID)', 'string', 'visit_medication_events.patient_medication_id'),
        c('event_type', 'Tipo de evento', 'string', 'visit_medication_events.event_type', { values: { added: 'Añadido', modified: 'Modificado', stopped: 'Suspendido', confirmed_no_change: 'Confirmado sin cambios' } }),
        c('old_value', 'Valor anterior (JSON)', 'json', 'visit_medication_events.old_value'),
        c('new_value', 'Valor nuevo (JSON)', 'json', 'visit_medication_events.new_value'),
        createdAt('visit_medication_events'),
      ],
      rows: raw.medicationEvents,
    },
    {
      id: 'documentos_visita', folder: 'raw', title: 'Documentos de visita (metadatos)', grain: 'Un documento adjunto', key: ['id'],
      columns: [
        c('id', 'Identificador del documento (UUID)', 'string', 'visit_documents.id'),
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'visit_documents.visit_id'),
        c('document_type', 'Tipo de documento', 'string', 'visit_documents.document_type'),
        c('mime_type', 'Formato', 'string', 'visit_documents.mime_type'),
        c('file_size', 'Tamaño', 'integer', 'visit_documents.file_size', { unit: 'bytes' }),
        c('notes', 'Notas', 'string', 'visit_documents.notes'),
        createdAt('visit_documents'),
        updatedAt('visit_documents'),
      ],
      rows: raw.documents,
    },
    {
      id: 'cmo_estratificaciones_registro', folder: 'raw', title: 'Estratificaciones CMO (registro)', grain: 'Una estratificación por visita', key: ['id'],
      columns: [
        c('id', 'Identificador de la estratificación (UUID)', 'string', 'cmo_stratification_registry.id'),
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'cmo_stratification_registry.visit_id'),
        c('patient_id', 'Identificador del paciente (UUID)', 'string', 'cmo_stratification_registry.patient_id'),
        c('center_id', 'Identificador del centro (UUID)', 'string', 'cmo_stratification_registry.center_id'),
        c('study_arm', 'Cohorte', 'string', 'cmo_stratification_registry.study_arm', { values: ARM_VALUES }),
        c('visit_type', 'Tipo de visita', 'string', 'cmo_stratification_registry.visit_type', { values: VISIT_TYPE_VALUES }),
        c('visit_number', 'Número de visita', 'integer', 'cmo_stratification_registry.visit_number'),
        c('visit_date', 'Fecha de realización', 'date', 'cmo_stratification_registry.visit_date'),
        c('scheduled_date', 'Fecha programada', 'date', 'cmo_stratification_registry.scheduled_date'),
        c('stratification_reason', 'Motivo de la estratificación', 'string', 'cmo_stratification_registry.stratification_reason'),
        c('engine_version', 'Versión del motor', 'string', 'cmo_stratification_registry.engine_version'),
        c('model_version', 'Versión del modelo', 'string', 'cmo_stratification_registry.model_version'),
        c('incomplete', 'Con variables desconocidas', 'boolean', 'cmo_stratification_registry.incomplete', { values: YES_NO }),
        c('unknown_count', 'Número de variables desconocidas', 'integer', 'cmo_stratification_registry.unknown_count'),
        c('unknown_variables', 'Variables desconocidas (JSON)', 'json', 'cmo_stratification_registry.unknown_variables'),
        c('results_visible', 'Resultados visibles para el usuario', 'boolean', 'cmo_stratification_registry.results_visible', { values: YES_NO }),
        c('score', 'Puntuación CMO total', 'decimal', 'cmo_stratification_registry.score'),
        c('priority', 'Nivel CMO (1 = mayor complejidad)', 'integer', 'cmo_stratification_registry.priority'),
        c('special_rule_applied', 'Regla especial aplicada', 'boolean', 'cmo_stratification_registry.special_rule_applied', { values: YES_NO }),
        c('block_scores', 'Puntuación por bloque (JSON)', 'json', 'cmo_stratification_registry.block_scores'),
        createdAt('cmo_scores'),
        updatedAt('cmo_scores'),
      ],
      rows: raw.cmoRegistry,
    },
    {
      id: 'cmo_estratificaciones_items', folder: 'raw', title: 'Estratificaciones CMO (valor por variable)', grain: 'Una variable de una estratificación', key: ['id'],
      columns: [
        c('id', 'Identificador del resultado (UUID)', 'string', 'cmo_stratification_item_values.id'),
        c('cmo_score_id', 'Identificador de la estratificación (UUID)', 'string', 'cmo_stratification_item_values.cmo_score_id'),
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'cmo_stratification_item_values.visit_id'),
        c('variable_code', 'Código de la variable CMO', 'string', 'cmo_stratification_item_values.variable_code'),
        c('label', 'Variable CMO', 'string', 'cmo_stratification_item_values.label'),
        c('block', 'Bloque', 'string', 'cmo_stratification_item_values.block'),
        c('sort_order', 'Orden', 'integer', 'cmo_stratification_item_values.sort_order'),
        c('is_scored', 'Puntúa', 'boolean', 'cmo_stratification_item_values.is_scored', { values: YES_NO }),
        c('model_version', 'Versión del modelo', 'string', 'cmo_stratification_item_values.model_version'),
        c('raw_value', 'Respuesta registrada (JSON)', 'json', 'cmo_stratification_item_values.raw_value'),
        c('item_score', 'Puntos de la variable', 'decimal', 'cmo_stratification_item_values.item_score'),
      ],
      rows: raw.cmoItems,
    },
  ];

  // ── Ítems de cuestionarios (formato largo) ──
  const itemRows: Row[] = [];
  const itemsByResponse = new Map<string, number>();
  for (const q of [...raw.questionnaires].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const responses = (q.responses ?? {}) as Record<string, unknown>;
    const keys = Object.keys(responses).sort(naturalItemOrder);
    itemsByResponse.set(q.id as string, keys.length);
    const visit = visitById.get(q.visit_id as string);
    for (const item of keys) {
      const value = responses[item];
      itemRows.push({
        response_id: q.id,
        study_code: studyCodeOfVisit(q.visit_id),
        visit_id: q.visit_id,
        visit_type: visit?.visit_type ?? null,
        questionnaire_code: q.questionnaire_code,
        instrument_version: mapByCode.get(q.questionnaire_code as string)?.instrument_version ?? null,
        item,
        valor_texto: itemText(value),
        valor_numerico: asNumberOrBoolean(value),
      });
    }
  }

  // ── Puntuaciones derivadas por visita e instrumento ──
  type Derived = { total: number | null; secondary: number | null; profile: string | null; answered: number; responses: Record<string, unknown> };
  const derivedByVisit = new Map<string, Map<string, Derived>>();
  for (const q of raw.questionnaires) {
    const type = normalizeQuestionnaireCode(q.questionnaire_code);
    if (!type) continue;
    const responses = (q.responses ?? {}) as Record<string, unknown>;
    const scores = deriveQuestionnaireScores(type, responses);
    const profile = typeof responses.profile === 'string' ? responses.profile : null;
    const answered = Object.values(responses).filter(isAnswered).length;
    if (!derivedByVisit.has(q.visit_id as string)) derivedByVisit.set(q.visit_id as string, new Map());
    derivedByVisit.get(q.visit_id as string)!.set(type, { total: scores.totalScore, secondary: scores.secondaryScore, profile, answered, responses });
  }
  const metricValue = (d: Derived | undefined, metric: Metric): unknown => {
    if (!d) return null;
    const value = metric.pick === 'total' ? d.total : metric.pick === 'secondary' ? d.secondary : d.profile;
    if (metric.type === 'boolean') return value === null ? null : value === 1;
    return value;
  };

  const interventionsByVisit = new Map<string, Row[]>();
  for (const i of raw.interventions) interventionsByVisit.set(i.visit_id as string, [...(interventionsByVisit.get(i.visit_id as string) ?? []), i]);
  const cmoByVisit = new Map(raw.cmoRegistry.map((r) => [r.visit_id as string, r]));
  const medsByPatient = new Map<string, Row[]>();
  for (const m of raw.patientMedications) medsByPatient.set(m.patient_id as string, [...(medsByPatient.get(m.patient_id as string) ?? []), m]);

  const medsAtDate = (patientId: string, dateIso: string | null): Row[] => {
    if (!dateIso) return [];
    return (medsByPatient.get(patientId) ?? []).filter((m) => (!m.start_date || (m.start_date as string) <= dateIso) && (!m.end_date || (m.end_date as string) >= dateIso));
  };
  const interventionStatus = (list: Row[]): string => {
    if (list.length === 0) return 'sin_registro';
    return list.some((i) => i.usual_care_code !== USUAL_CARE_NO_INTERVENTION_CODE) ? 'con_intervencion' : 'sin_intervencion';
  };

  // ── LONG: una fila por visita ──
  const instrumentColumns = (suffix: string, visitLabel: string): ColumnSpec[] =>
    INSTRUMENTS.flatMap((ins) => [
      c(`${ins.prefix}_registrado${suffix}`, `${ins.name} registrado${visitLabel}`, 'boolean', 'derivada', { instrument: ins.name, values: YES_NO, rule: 'Existe registro del cuestionario en la visita.' }),
      c(`${ins.prefix}_items_respondidos${suffix}`, `${ins.name} número de ítems con respuesta${visitLabel}`, 'integer', 'derivada', { instrument: ins.name, rule: 'Claves con valor no vacío en el registro original.' }),
      ...ins.metrics.map((m) => c(`${ins.prefix}_${m.suffix}${suffix}`, `${m.label}${visitLabel}`, m.type, 'derivada', { instrument: ins.name, rule: `${m.rule} Algoritmo: ${QUESTIONNAIRE_SCORING_VERSION}.`, values: m.values })),
    ]);
  const instrumentValues = (visitId: string | null, suffix: string): Row => {
    const out: Row = {};
    const derived = visitId ? derivedByVisit.get(visitId) : undefined;
    for (const ins of INSTRUMENTS) {
      const d = derived?.get(ins.type);
      out[`${ins.prefix}_registrado${suffix}`] = visitId ? Boolean(d) : null;
      out[`${ins.prefix}_items_respondidos${suffix}`] = d ? d.answered : null;
      for (const m of ins.metrics) out[`${ins.prefix}_${m.suffix}${suffix}`] = metricValue(d, m);
    }
    return out;
  };

  const sortedVisits = [...raw.visits].sort(
    (a, b) => String(studyCodeOfPatient(a.patient_id) ?? '').localeCompare(String(studyCodeOfPatient(b.patient_id) ?? ''))
      || String(a.visit_date ?? a.scheduled_date ?? '9999').localeCompare(String(b.visit_date ?? b.scheduled_date ?? '9999'))
      || String(a.id).localeCompare(String(b.id)),
  );

  const longRows = sortedVisits.map((v) => {
    const p = patientById.get(v.patient_id as string);
    const center = centerOfPatient(v.patient_id);
    const cmo = cmoByVisit.get(v.id as string);
    const list = interventionsByVisit.get(v.id as string) ?? [];
    const date = (v.visit_date ?? v.scheduled_date) as string | null;
    return {
      study_code: p?.study_code ?? null,
      center_code: center?.code ?? null,
      study_arm: center?.study_arm ?? null,
      visit_id: v.id,
      visit_type: v.visit_type,
      visit_number: v.visit_number,
      visit_status: v.visit_status,
      scheduled_date: v.scheduled_date,
      visit_date: v.visit_date,
      dias_desde_inclusion: daysBetween(p?.inclusion_date as string | null, v.visit_date as string | null),
      extraordinary_reason: v.extraordinary_reason,
      cmo_score: cmo?.score ?? null,
      cmo_nivel: cmo?.priority ?? null,
      cmo_incompleta: cmo ? cmo.incomplete ?? null : null,
      cmo_model_version: cmo?.model_version ?? null,
      ...instrumentValues(v.id as string, ''),
      n_intervenciones: list.filter((i) => i.usual_care_code !== USUAL_CARE_NO_INTERVENTION_CODE).length,
      registro_intervenciones: interventionStatus(list),
      n_tratamientos_vigentes: date ? medsAtDate(v.patient_id as string, date).length : null,
    };
  });

  const longColumns: ColumnSpec[] = [
    c('study_code', 'Código de estudio del paciente', 'string', 'patients.study_code'),
    c('center_code', 'Código del centro', 'string', 'centers.code'),
    c('study_arm', 'Cohorte', 'string', 'centers.study_arm', { values: ARM_VALUES }),
    c('visit_id', 'Identificador de la visita (UUID)', 'string', 'visits.id'),
    c('visit_type', 'Tipo de visita', 'string', 'visits.visit_type', { values: VISIT_TYPE_VALUES }),
    c('visit_number', 'Número de visita del calendario', 'integer', 'visits.visit_number'),
    c('visit_status', 'Estado de la visita', 'string', 'visits.visit_status', { values: VISIT_STATUS_VALUES }),
    c('scheduled_date', 'Fecha programada', 'date', 'visits.scheduled_date'),
    c('visit_date', 'Fecha de realización', 'date', 'visits.visit_date', { definition: 'Fecha clínica de la visita. Vacía si no consta realizada.' }),
    c('dias_desde_inclusion', 'Días desde la inclusión hasta la visita', 'integer', 'derivada', { unit: 'días', rule: 'visit_date − inclusion_date; vacío si falta alguna de las dos.' }),
    c('extraordinary_reason', 'Motivo de la visita extraordinaria', 'string', 'visits.extraordinary_reason'),
    c('cmo_score', 'Puntuación CMO total', 'decimal', 'cmo_stratification_registry.score', { notes: 'Vacía en la cohorte estándar (no estratifica) y en visitas sin estratificar.' }),
    c('cmo_nivel', 'Nivel CMO (1 = mayor complejidad)', 'integer', 'cmo_stratification_registry.priority', { values: { '1': 'Nivel 1', '2': 'Nivel 2', '3': 'Nivel 3' } }),
    c('cmo_incompleta', 'Estratificación con variables desconocidas', 'boolean', 'cmo_stratification_registry.incomplete', { values: YES_NO }),
    c('cmo_model_version', 'Versión del modelo CMO', 'string', 'cmo_stratification_registry.model_version'),
    ...instrumentColumns('', ''),
    c('n_intervenciones', 'Número de intervenciones en la visita', 'integer', 'derivada', { rule: 'Intervenciones registradas excluyendo el marcador «Sin intervención».' }),
    c('registro_intervenciones', 'Registro de intervenciones', 'string', 'derivada', { values: { sin_registro: 'Sin registro', sin_intervencion: 'Registrado: sin intervención', con_intervencion: 'Con intervención' }, rule: 'Distingue «no registrado» de «sin intervención».' }),
    c('n_tratamientos_vigentes', 'Número de tratamientos vigentes en la fecha de la visita', 'integer', 'derivada', { rule: 'Tratamientos con inicio ≤ fecha y (fin vacío o ≥ fecha). Fecha = realización o, si no consta, programada. Vacío si la visita no tiene fecha.' }),
  ];

  // ── WIDE: una fila por paciente ──
  const visitsByPatient = new Map<string, Row[]>();
  for (const v of raw.visits) visitsByPatient.set(v.patient_id as string, [...(visitsByPatient.get(v.patient_id as string) ?? []), v]);

  const iexpacItemKeys = Array.from({ length: 15 }, (_, i) => `q${i + 1}`);
  const wideColumns: ColumnSpec[] = [
    c('study_code', 'Código de estudio del paciente', 'string', 'patients.study_code'),
    c('center_code', 'Código del centro', 'string', 'centers.code'),
    c('study_arm', 'Cohorte', 'string', 'centers.study_arm', { values: ARM_VALUES }),
    c('inclusion_date', 'Fecha de inclusión', 'date', 'patients.inclusion_date'),
    c('screening_date', 'Fecha de cribado', 'date', 'patients.screening_date'),
    c('age_at_inclusion', 'Edad en la inclusión', 'integer', 'patients.age_at_inclusion', { unit: 'años' }),
    c('sex', 'Sexo', 'string', 'patients.sex', { values: SEX_VALUES }),
    c('consent_signed', 'Consentimiento informado firmado', 'boolean', 'patients.consent_signed', { values: YES_NO }),
    c('n_visitas', 'Número de visitas registradas (cualquier estado)', 'integer', 'derivada'),
    c('n_visitas_extra', 'Número de visitas extraordinarias', 'integer', 'derivada'),
  ];
  for (const slot of VISIT_SLOTS) {
    const s = `_${slot.suffix}`;
    const l = ` (${slot.label})`;
    wideColumns.push(
      c(`estado${s}`, `Estado de la visita${l}`, 'string', 'visits.visit_status', { visit: slot.label, values: VISIT_STATUS_VALUES, rule: 'Visita no cancelada de este tipo; si solo hay canceladas, «cancelled».' }),
      c(`fecha_prog${s}`, `Fecha programada${l}`, 'date', 'visits.scheduled_date', { visit: slot.label }),
      c(`fecha${s}`, `Fecha de realización${l}`, 'date', 'visits.visit_date', { visit: slot.label }),
      c(`dias_inclusion${s}`, `Días desde la inclusión${l}`, 'integer', 'derivada', { visit: slot.label, unit: 'días', rule: 'Fecha de realización − fecha de inclusión.' }),
      c(`cmo_score${s}`, `Puntuación CMO total${l}`, 'decimal', 'cmo_stratification_registry.score', { visit: slot.label }),
      c(`cmo_nivel${s}`, `Nivel CMO${l}`, 'integer', 'cmo_stratification_registry.priority', { visit: slot.label, values: { '1': 'Nivel 1', '2': 'Nivel 2', '3': 'Nivel 3' } }),
      ...instrumentColumns(s, l).map((col) => ({ ...col, visit: slot.label })),
      ...iexpacItemKeys.map((k) => c(`iexpac_${k}${s}`, `IEXPAC ítem ${k.slice(1)}${l}`, 'integer', 'questionnaire_responses.responses', { visit: slot.label, instrument: 'IEXPAC', values: IEXPAC_ANSWER_LABELS, notes: 'Ítems 12-15 condicionados: vacío = no aplica o no contestado (no distinguibles en el registro actual).' })),
      c(`n_intervenciones${s}`, `Número de intervenciones${l}`, 'integer', 'derivada', { visit: slot.label }),
    );
  }
  const changeVars: Array<{ name: string; label: string; from: string; type: ColumnType }> = [
    { name: 'iexpac_total_cambio_v12_v0', label: 'Cambio en IEXPAC global (mes 12 − basal)', from: 'iexpac_total', type: 'decimal' },
    { name: 'dlqi_total_cambio_v12_v0', label: 'Cambio en DLQI total (mes 12 − basal)', from: 'dlqi_total', type: 'integer' },
    { name: 'evasaf_media_cambio_v12_v0', label: 'Cambio en EVASAF media (mes 12 − basal)', from: 'evasaf_media', type: 'decimal' },
    { name: 'eq5d_eva_cambio_v12_v0', label: 'Cambio en EQ-5D-5L EVA (mes 12 − basal)', from: 'eq5d_eva', type: 'decimal' },
    { name: 'pam10_suma_cambio_v12_v0', label: 'Cambio en PAM-10 bruta (mes 12 − basal)', from: 'pam10_suma', type: 'integer' },
  ];
  for (const ch of changeVars) {
    wideColumns.push(c(ch.name, ch.label, ch.type, 'derivada', { rule: `${ch.from}_v12 − ${ch.from}_v0; vacío si falta alguno. Redondeo a 4 decimales para evitar error de coma flotante.` }));
  }

  const wideRows = [...raw.patients]
    .sort((a, b) => String(a.study_code).localeCompare(String(b.study_code)))
    .map((p) => {
      const center = centerById.get(p.center_id as string);
      const visits = visitsByPatient.get(p.id as string) ?? [];
      const row: Row = {
        study_code: p.study_code,
        center_code: center?.code ?? null,
        study_arm: center?.study_arm ?? null,
        inclusion_date: p.inclusion_date,
        screening_date: p.screening_date,
        age_at_inclusion: p.age_at_inclusion,
        sex: p.sex,
        consent_signed: p.consent_signed,
        n_visitas: visits.length,
        n_visitas_extra: visits.filter((v) => v.visit_type === 'extra').length,
      };
      for (const slot of VISIT_SLOTS) {
        const s = `_${slot.suffix}`;
        const ofType = visits.filter((v) => v.visit_type === slot.type);
        const active = ofType.filter((v) => v.visit_status !== 'cancelled').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        const v = active[active.length - 1];
        row[`estado${s}`] = v ? v.visit_status : ofType.length > 0 ? 'cancelled' : null;
        row[`fecha_prog${s}`] = v?.scheduled_date ?? null;
        row[`fecha${s}`] = v?.visit_date ?? null;
        row[`dias_inclusion${s}`] = v ? daysBetween(p.inclusion_date as string | null, v.visit_date as string | null) : null;
        const cmo = v ? cmoByVisit.get(v.id as string) : undefined;
        row[`cmo_score${s}`] = cmo?.score ?? null;
        row[`cmo_nivel${s}`] = cmo?.priority ?? null;
        Object.assign(row, instrumentValues(v ? (v.id as string) : null, s));
        const iexpac = v ? derivedByVisit.get(v.id as string)?.get('iexpac') : undefined;
        for (const k of iexpacItemKeys) {
          const value = iexpac?.responses[k];
          if (value !== undefined && value !== null && !(typeof value === 'number' && Number.isInteger(value))) {
            issues.push({ tipo: 'valor_no_numerico', gravedad: 'error', tabla: 'questionnaire_responses', registro_id: v ? (v.id as string) : null, study_code: p.study_code as string, detalle: `IEXPAC ${k} con valor no entero (${JSON.stringify(value)}): conservado en cuestionarios_items, vacío en WIDE.` });
            row[`iexpac_${k}${s}`] = null;
          } else {
            row[`iexpac_${k}${s}`] = value ?? null;
          }
        }
        row[`n_intervenciones${s}`] = v ? (interventionsByVisit.get(v.id as string) ?? []).filter((i) => i.usual_care_code !== USUAL_CARE_NO_INTERVENTION_CODE).length : null;
      }
      for (const ch of changeVars) {
        const a = row[`${ch.from}_v0`];
        const b = row[`${ch.from}_v12`];
        row[ch.name] = typeof a === 'number' && typeof b === 'number' ? Number((b - a).toFixed(4)) : null;
      }
      return row;
    });

  // ── Estratificaciones CMO (formato de análisis existente, con identificadores estables) ──
  const cmoRows = buildStratificationExportRows(raw.cmoRegistry as unknown as StratificationRegistryRow[], raw.cmoItems as unknown as StratificationItemValueRow[], {
    patientIdAnon: (id) => studyCodeOfPatient(id) ?? '',
    visitIdAnon: (id) => id,
    centerCode: (id) => (centerOfPatient(id)?.code as string | undefined) ?? '',
    visitTypeLabel: (t) => t ?? '',
    stratificationId: (entry) => entry.id,
  }).map(({ patient_id, ...rest }) => ({ study_code: patient_id, ...rest }));
  const cmoDictionary = stratificationSpssDictionary();
  const cmoHeaders = cmoRows.length > 0 ? Object.keys(cmoRows[0]) : ['study_code', ...Object.keys(cmoDictionary.variableLabels).filter((k) => k !== 'patient_id')];
  const cmoColumns: ColumnSpec[] = cmoHeaders.map((name) => {
    const label = name === 'study_code' ? 'Código de estudio del paciente' : name === 'visit_id' ? 'Identificador de la visita (UUID)' : name === 'stratification_id' ? 'Identificador de la estratificación (UUID)' : cmoDictionary.variableLabels[name] ?? name;
    const type: ColumnType = ['study_code', 'stratification_id', 'visit_id', 'center_code', 'study_arm', 'visit_type', 'engine_version', 'model_version'].includes(name)
      ? 'string'
      : ['visit_date', 'fecha_registro'].includes(name)
        ? 'date'
        : name.startsWith('score_')
          ? 'decimal'
          : 'integer';
    return c(name, label, type, name.startsWith('cmo_') || name.startsWith('inf_') ? 'cmo_stratification_item_values.raw_value (codificado)' : 'cmo_stratification_registry', {
      values: name === 'visit_type' ? VISIT_TYPE_VALUES : cmoDictionary.valueLabels[name],
      notes: name.startsWith('cmo_') || name.startsWith('inf_') ? '9 = Desconocido (respuesta «no se sabe»); vacío = no registrado.' : undefined,
    });
  });

  // ── Medicación por visita ──
  const medVisitRows: Row[] = [];
  for (const v of sortedVisits) {
    const date = (v.visit_date ?? v.scheduled_date) as string | null;
    for (const m of medsAtDate(v.patient_id as string, date).sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      const cat = catalogById.get(m.medication_catalog_id as string);
      const atc = (cat?.atc_code as string | null | undefined)?.trim().toUpperCase() ?? null;
      medVisitRows.push({
        visit_id: v.id,
        patient_medication_id: m.id,
        study_code: studyCodeOfPatient(v.patient_id),
        visit_type: v.visit_type,
        fecha_referencia: date,
        medicamento: (cat?.display_name as string | undefined) ?? m.selected_label_snapshot ?? null,
        principio_activo: cat?.active_ingredient ?? null,
        atc_code: atc || null,
        atc_grupo: atc && /^[A-Z]/.test(atc) ? atc[0] : null,
        dose_text: m.dose_text,
        frequency_text: m.frequency_text,
        route_text: m.route_text,
        indication: m.indication,
        start_date: m.start_date,
        end_date: m.end_date,
        is_active: m.is_active,
        periodo_incierto: m.is_active === false && !m.end_date,
      });
    }
  }

  const analysisDatasets: Dataset[] = [
    {
      id: 'long_visitas', folder: 'analisis', title: 'Formato longitudinal (LONG): una fila por paciente y visita', grain: 'Una visita', key: ['visit_id'],
      columns: longColumns, rows: longRows,
    },
    {
      id: 'wide_pacientes', folder: 'analisis', title: 'Formato transversal (WIDE): una fila por paciente', grain: 'Un paciente', key: ['study_code'],
      columns: wideColumns, rows: wideRows,
    },
    {
      id: 'cuestionarios_items', folder: 'analisis', title: 'Respuestas individuales a cuestionarios (formato largo)', grain: 'Un ítem de un cuestionario en una visita', key: ['response_id', 'item'],
      columns: [
        c('response_id', 'Identificador del registro de cuestionario (UUID)', 'string', 'questionnaire_responses.id'),
        c('study_code', 'Código de estudio del paciente', 'string', 'patients.study_code'),
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'questionnaire_responses.visit_id'),
        c('visit_type', 'Tipo de visita', 'string', 'visits.visit_type', { values: VISIT_TYPE_VALUES }),
        c('questionnaire_code', 'Instrumento', 'string', 'questionnaire_responses.questionnaire_code'),
        c('instrument_version', 'Versión del instrumento', 'string', 'questionnaire_measurement_map.instrument_version'),
        c('item', 'Ítem (clave original)', 'string', 'questionnaire_responses.responses (clave)'),
        c('valor_texto', 'Respuesta tal como está almacenada', 'string', 'questionnaire_responses.responses (valor)', { definition: 'Texto si la respuesta es texto; si no, su representación JSON (números, true/false).' }),
        c('valor_numerico', 'Respuesta numérica', 'decimal', 'derivada', { rule: 'Número tal cual; booleano: 1 = sí/verdadero, 0 = no/falso; vacío si la respuesta es texto.' }),
      ],
      rows: itemRows,
    },
    {
      id: 'estratificaciones_cmo', folder: 'analisis', title: 'Estratificaciones CMO codificadas (una fila por estratificación)', grain: 'Una estratificación', key: ['stratification_id'],
      columns: cmoColumns, rows: cmoRows,
    },
    {
      id: 'medicacion_por_visita', folder: 'analisis', title: 'Tratamientos vigentes en cada visita', grain: 'Un tratamiento vigente en una visita', key: ['visit_id', 'patient_medication_id'],
      columns: [
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'visits.id'),
        c('patient_medication_id', 'Identificador del tratamiento (UUID)', 'string', 'patient_medications.id'),
        c('study_code', 'Código de estudio del paciente', 'string', 'patients.study_code'),
        c('visit_type', 'Tipo de visita', 'string', 'visits.visit_type', { values: VISIT_TYPE_VALUES }),
        c('fecha_referencia', 'Fecha de referencia de la visita', 'date', 'derivada', { rule: 'Fecha de realización o, si no consta, programada.' }),
        c('medicamento', 'Medicamento', 'string', 'medication_catalog.display_name'),
        c('principio_activo', 'Principio activo', 'string', 'medication_catalog.active_ingredient'),
        c('atc_code', 'Código ATC', 'string', 'medication_catalog.atc_code'),
        c('atc_grupo', 'Grupo anatómico ATC (1.er nivel)', 'string', 'derivada'),
        c('dose_text', 'Dosis', 'string', 'patient_medications.dose_text'),
        c('frequency_text', 'Frecuencia', 'string', 'patient_medications.frequency_text'),
        c('route_text', 'Vía', 'string', 'patient_medications.route_text'),
        c('indication', 'Indicación', 'string', 'patient_medications.indication'),
        c('start_date', 'Fecha de inicio', 'date', 'patient_medications.start_date'),
        c('end_date', 'Fecha de fin', 'date', 'patient_medications.end_date'),
        c('is_active', 'Tratamiento activo actualmente', 'boolean', 'patient_medications.is_active', { values: YES_NO }),
        c('periodo_incierto', 'Periodo de tratamiento incierto', 'boolean', 'derivada', { values: YES_NO, rule: 'Tratamiento inactivo sin fecha de fin: no se sabe hasta cuándo estuvo vigente.' }),
      ],
      rows: medVisitRows,
    },
  ];

  const issuesDataset: Dataset = {
    id: 'incidencias_integridad', folder: 'analisis', title: 'Incidencias de integridad detectadas en la extracción', grain: 'Una incidencia', key: ['tipo', 'tabla', 'registro_id', 'detalle'],
    columns: [
      c('tipo', 'Tipo de incidencia', 'string', 'derivada'),
      c('gravedad', 'Gravedad', 'string', 'derivada', { values: { error: 'Error de integridad', revisar: 'Valor a revisar (puede ser correcto)' } }),
      c('tabla', 'Tabla', 'string', 'derivada'),
      c('registro_id', 'Registro afectado', 'string', 'derivada'),
      c('study_code', 'Código de estudio del paciente', 'string', 'derivada'),
      c('detalle', 'Detalle', 'string', 'derivada'),
    ],
    rows: issues,
  };

  return { datasets: [...rawDatasets, ...analysisDatasets, issuesDataset], issues };
}
