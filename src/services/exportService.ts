import * as XLSX from 'xlsx';

import { getVisitTypeLabel } from '../constants/enums';
import { supabase } from '../lib/supabase';
import { buildSavFile } from '../utils/spssWriter';
import type { StratificationItemValueRow, StratificationRegistryRow } from './cmoStratificationService';
import { dlqiBand } from './dlqi';
import { listAllQuestionnaires } from './questionnaireService';
import { buildStratificationExportRows, stratificationSpssDictionary } from './stratificationExport';

type ExportOutcome = {
  success: boolean;
  errorMessage: string | null;
  generatedFiles: string[];
};

type PatientRow = {
  id: string;
  study_code: string;
  inclusion_date: string | null;
  age_at_inclusion: number | null;
  sex: string | null;
  created_at: string | null;
  center: { code: string; study_arm: string | null } | { code: string; study_arm: string | null }[] | null;
};

function centerOf(patient: PatientRow | undefined) {
  return Array.isArray(patient?.center) ? patient?.center[0] : patient?.center;
}

function centerCodeOf(patient: PatientRow | undefined): string {
  return centerOf(patient)?.code ?? '';
}

function studyArmOf(patient: PatientRow | undefined): string {
  return centerOf(patient)?.study_arm ?? '';
}

// PostgREST limita el número de filas por petición (1000 por defecto en Supabase): se pagina.
async function fetchAllRows<T>(view: string, select: string, orderBy: string): Promise<{ data: T[]; error: { message: string } | null }> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase!.from(view).select(select).order(orderBy, { ascending: true }).range(from, from + pageSize - 1);
    if (error) return { data: [], error };
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return { data: rows, error: null };
}

type VisitRow = {
  id: string;
  patient_id: string;
  visit_type: string | null;
  visit_number: number | null;
  visit_date: string | null;
  scheduled_date: string | null;
  created_at: string | null;
};

type ScoreRow = {
  visit_id: string;
  score: number | null;
  priority: number | null;
};

type InterventionRow = {
  id: string;
  visit_id: string;
  intervention_type: string;
  intervention_domain: string | null;
  priority_level: string | null;
  delivered: boolean | null;
  linked_to_cmo_level: number | null;
  outcome: string | null;
  notes: string | null;
  catalog_code: string | null;
  catalog_version: string | null;
  usual_care_code: string | null;
  usual_care_version: string | null;
  created_at: string | null;
};

const USUAL_CARE_NO_INTERVENTION_CODE = 'sin-intervencion';

/** Actividades reales de la visita: excluye el marcador «Sin intervención» del listado estándar. */
export function countRealInterventions(interventions: Array<Pick<InterventionRow, 'usual_care_code'>>): number {
  return interventions.filter((row) => row.usual_care_code !== USUAL_CARE_NO_INTERVENTION_CODE).length;
}

/** Distingue «no registrado» de «sin intervención» (un hueco no es un cero). */
export function interventionRecordStatus(interventions: Array<Pick<InterventionRow, 'usual_care_code'>>): 'sin_registro' | 'sin_intervencion' | 'con_intervencion' {
  if (interventions.length === 0) return 'sin_registro';
  return countRealInterventions(interventions) === 0 ? 'sin_intervencion' : 'con_intervencion';
}

type QuestionnaireRow = {
  visit_id: string;
  patient_id: string | null;
  visit_type: string;
  questionnaire_type: 'iexpac' | 'morisky' | 'eq5d' | 'pam10' | 'dlqi' | 'evasaf';
  responses: Record<string, unknown>;
  total_score: number | null;
  secondary_score: number | null;
};

type PatientMedicationRow = {
  id: string;
  patient_id: string;
  medication_catalog_id: string;
  catalog_concept_id: string | null;
  catalog_product_id: string | null;
  selection_source: string | null;
  selected_label_snapshot: string | null;
  dose_text: string | null;
  frequency_text: string | null;
  route_text: string | null;
  indication: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  medication_catalog:
    | {
        display_name: string;
        active_ingredient: string | null;
        atc_code: string | null;
      }
    | {
        display_name: string;
        active_ingredient: string | null;
        atc_code: string | null;
      }[]
    | null;
};

type NormalizedPatientMedicationRow = Omit<PatientMedicationRow, 'medication_catalog'> & {
  medication_catalog: {
    display_name: string;
    active_ingredient: string | null;
    atc_code: string | null;
  } | null;
};

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (/[,\n";]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const headerLine = headers.join(',');
  const bodyLines = rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(','));
  return [headerLine, ...bodyLines].join('\n');
}

function normalizeTextValue(value: string): string {
  return value.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeDateValue(value: string): string {
  const normalized = normalizeTextValue(value);
  if (!normalized) return '';
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toISOString().slice(0, 10);
}

function normalizeValueForExport(header: string, value: unknown): string | number {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'string') {
    if (header.endsWith('_date') || header.startsWith('fecha_') || header === 'visit_date' || header === 'scheduled_date' || header === 'inclusion_date') {
      return normalizeDateValue(value);
    }
    return normalizeTextValue(value);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return normalizeTextValue(JSON.stringify(value));
}

function normalizeRowsForExport(rows: Array<Record<string, unknown>>): Array<Record<string, string | number>> {
  return rows.map((row) => {
    const entries = Object.entries(row).map(([header, value]) => [header, normalizeValueForExport(header, value)]);
    return Object.fromEntries(entries);
  });
}

function downloadCsv(fileName: string, csvContent: string) {
  const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadTextFile(fileName: string, content: string, mime = 'text/plain;charset=utf-8;') {
  const blob = new Blob(['\uFEFF', content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadBinaryFile(fileName: string, data: Uint8Array, mime = 'application/octet-stream') {
  const binary = Uint8Array.from(data);
  const blob = new Blob([binary], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildXlsx(sheets: Array<{ name: string; rows: Array<Record<string, string | number>> }>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayLike<number>;
  return new Uint8Array(raw);
}

function buildAnonymousPatientIds(patients: PatientRow[]): Map<string, string> {
  const sorted = [...patients].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));

  return new Map(sorted.map((patient, index) => [patient.id, `P${String(index + 1).padStart(4, '0')}`]));
}

function getMainPillar(allInterventions: InterventionRow[]): string {
  // Solo intervenciones CMO: las del listado estándar no tienen pilar CMO.
  const interventions = allInterventions.filter((intervention) => !intervention.usual_care_code);
  if (interventions.length === 0) return '';

  const counts = new Map<string, number>();
  interventions.forEach((intervention) => {
    const pillar = intervention.intervention_domain ?? 'No asignado';
    counts.set(pillar, (counts.get(pillar) ?? 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function getVisitOutcome(interventions: InterventionRow[]): string {
  const values = interventions
    .map((intervention) => intervention.outcome?.trim())
    .filter((value): value is string => Boolean(value));

  if (values.length === 0) return '';

  const counts = new Map<string, number>();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function normalizeAtcGroup(atcCode: string | null | undefined): string | null {
  if (!atcCode) return null;
  const normalized = atcCode.trim().toUpperCase();
  if (!normalized) return null;
  return /^[A-Z]/.test(normalized) ? normalized[0] : null;
}

function normalizeMedicationCatalogRelation(
  value:
    | {
        display_name: string;
        active_ingredient: string | null;
        atc_code: string | null;
      }
    | {
        display_name: string;
        active_ingredient: string | null;
        atc_code: string | null;
      }[]
    | null,
) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function escapeSpsLabel(value: string): string {
  return value.replace(/'/g, "''");
}

function inferSpsFormatByHeader(header: string): { format: string; type: 'numeric' | 'string' } {
  if (header.endsWith('_date') || header.startsWith('fecha_') || header === 'visit_date' || header === 'scheduled_date' || header === 'inclusion_date') {
    return { format: 'EDATE10', type: 'numeric' };
  }

  // Variables codificadas de la estratificación CMO (0/1/2/9) e indicadores del registro.
  if (/^(cmo_|inf_)/.test(header) || ['motivo_estratificacion', 'regla_especial', 'incompleta', 'n_desconocidas'].includes(header)) {
    return { format: 'F2.0', type: 'numeric' };
  }

  if (
    header.includes('score') ||
    header.includes('nivel') ||
    header.includes('count') ||
    header.includes('number') ||
    header.includes('edad') ||
    header.includes('weight') ||
    header.includes('height') ||
    header.includes('bmi') ||
    header.includes('waist') ||
    header.includes('glucose') ||
    header.includes('hba1c') ||
    header.includes('ldl') ||
    header.includes('hdl') ||
    header.includes('risk') ||
    header.includes('delta') ||
    header.includes('intervenciones')
  ) {
    return { format: 'F8.2', type: 'numeric' };
  }

  if (header.startsWith('is_') || header.startsWith('has_') || header.endsWith('_present') || header.endsWith('_active') || header === 'polypharmacy') {
    return { format: 'F1.0', type: 'numeric' };
  }

  return { format: 'A120', type: 'string' };
}

function buildSpsSyntax(options: {
  csvFileName: string;
  datasetName: string;
  headers: string[];
  variableLabels?: Record<string, string>;
  categoricalValueLabels?: Record<string, Record<string, string>>;
}): string {
  const variableDefs = options.headers
    .map((header) => {
      const inferred = inferSpsFormatByHeader(header);
      return `  ${header} ${inferred.type === 'string' ? '(A120)' : ''}`.trimEnd();
    })
    .join('\n');

  const formats = options.headers
    .map((header) => {
      const inferred = inferSpsFormatByHeader(header);
      return `  ${header} (${inferred.format})`;
    })
    .join('\n');

  const variableLabelLines = Object.entries(options.variableLabels ?? {})
    .map(([variable, label]) => `  ${variable} '${escapeSpsLabel(label)}'`)
    .join('\n');

  const valueLabelBlocks = Object.entries(options.categoricalValueLabels ?? {})
    .map(([variable, labels]) => {
      const labelLines = Object.entries(labels)
        .map(([rawValue, label]) => `    '${escapeSpsLabel(rawValue)}' '${escapeSpsLabel(label)}'`)
        .join('\n');
      return `VALUE LABELS ${variable}\n${labelLines}\n.`;
    })
    .join('\n\n');

  return [
    `* Archivo de sintaxis SPSS para ${options.datasetName}.`,
    `* Recomendación: definir codificación UTF-8 en IBM SPSS antes de ejecutar.`,
    'SET UNICODE ON.',
    `GET DATA`,
    `  /TYPE=TXT`,
    `  /FILE='${options.csvFileName}'`,
    `  /ENCODING='UTF8'`,
    `  /DELCASE=LINE`,
    `  /DELIMITERS=','`,
    `  /QUALIFIER='\"'`,
    `  /ARRANGEMENT=DELIMITED`,
    `  /FIRSTCASE=2`,
    `  /VARIABLES=`,
    variableDefs,
    '.',
    'CACHE.',
    'EXECUTE.',
    'FORMATS',
    formats,
    '.',
    'MISSING VALUES ALL ("").',
    variableLabelLines ? `VARIABLE LABELS\n${variableLabelLines}\n.` : '',
    valueLabelBlocks,
    'EXECUTE.',
  ]
    .filter(Boolean)
    .join('\n');
}

function isBaselineVisitType(visitType: string | null): boolean {
  return visitType === 'baseline';
}

function isFinalVisitType(visitType: string | null): boolean {
  return visitType === 'final' || visitType === 'month_12';
}

function compareVisitDate(a: VisitRow, b: VisitRow): number {
  const tsA = new Date(a.visit_date ?? a.scheduled_date ?? '9999-12-31').getTime();
  const tsB = new Date(b.visit_date ?? b.scheduled_date ?? '9999-12-31').getTime();
  if (tsA !== tsB) return tsA - tsB;
  return (a.created_at ?? '').localeCompare(b.created_at ?? '');
}

function getLatestVisitIdByType(visits: VisitRow[], selector: (visitType: string | null) => boolean): string | null {
  const filtered = [...visits].filter((visit) => selector(visit.visit_type)).sort(compareVisitDate);
  return filtered.length > 0 ? filtered[filtered.length - 1].id : null;
}

// Exportación de la base de investigación (CSV, XLSX, SPSS .sav y sintaxis .sps), anonimizada.
// DERMAPEX: se han retirado las variables de la evaluación clínica cardiovascular de IRIS
// (tabla clinical_assessments). Las variables clínicas de dermatitis atópica, los PROs del
// protocolo y el diccionario de datos definitivo se incorporarán en la fase de adaptación clínica.
export async function exportResearchDataBundle(): Promise<ExportOutcome> {
  if (!supabase) {
    return { success: false, errorMessage: 'Supabase no está configurado. No se puede exportar.', generatedFiles: [] };
  }

  const [
    patientsResult,
    visitsResult,
    scoresResult,
    interventionsResult,
    questionnairesResult,
    patientMedicationsResult,
    stratificationRegistryResult,
    stratificationItemsResult,
  ] = await Promise.all([
    supabase.from('patients').select('id,study_code,inclusion_date,age_at_inclusion,sex,created_at,center:centers(code,study_arm)').order('created_at', { ascending: true }),
    supabase.from('visits').select('id,patient_id,visit_type,visit_number,visit_date,scheduled_date,created_at').order('created_at', { ascending: true }),
    supabase.from('cmo_scores').select('visit_id,score,priority'),
    supabase.from('interventions').select('id,visit_id,intervention_type,intervention_domain,priority_level,delivered,linked_to_cmo_level,outcome,notes,catalog_code,catalog_version,usual_care_code,usual_care_version,created_at').order('created_at', { ascending: true }),
    listAllQuestionnaires(),
    supabase
      .from('patient_medications')
      .select(
        'id,patient_id,medication_catalog_id,catalog_concept_id,catalog_product_id,selection_source,selected_label_snapshot,dose_text,frequency_text,route_text,indication,start_date,end_date,is_active,notes,created_at,updated_at,medication_catalog:medication_catalog_id(display_name,active_ingredient,atc_code)',
      )
      .order('created_at', { ascending: true }),
    // Vistas enmascaradas: en centros del brazo estándar las columnas de resultado llegan vacías (D5).
    fetchAllRows<StratificationRegistryRow>(
      'cmo_stratification_registry',
      'id,visit_id,patient_id,center_id,study_arm,visit_type,visit_number,visit_date,scheduled_date,stratification_reason,engine_version,model_version,incomplete,unknown_count,unknown_variables,created_at,updated_at,results_visible,score,priority,special_rule_applied,block_scores',
      'created_at',
    ),
    fetchAllRows<StratificationItemValueRow>(
      'cmo_stratification_item_values',
      'id,cmo_score_id,visit_id,variable_code,label,block,sort_order,is_scored,model_version,raw_value,item_score',
      'id',
    ),
  ]);

  const firstError = [
    patientsResult.error,
    visitsResult.error,
    scoresResult.error,
    interventionsResult.error,
    questionnairesResult.errorMessage ? { message: questionnairesResult.errorMessage } : null,
    patientMedicationsResult.error,
    stratificationRegistryResult.error,
    stratificationItemsResult.error,
  ].find(Boolean);

  if (firstError) {
    return { success: false, errorMessage: firstError.message, generatedFiles: [] };
  }

  const patients = (patientsResult.data ?? []) as PatientRow[];
  const visits = (visitsResult.data ?? []) as VisitRow[];
  const scores = (scoresResult.data ?? []) as ScoreRow[];
  const interventions = (interventionsResult.data ?? []) as InterventionRow[];
  const questionnaires = (questionnairesResult.data ?? []) as QuestionnaireRow[];
  const patientMedications = ((patientMedicationsResult.data ?? []) as PatientMedicationRow[]).map((row) => ({
    ...row,
    medication_catalog: normalizeMedicationCatalogRelation(row.medication_catalog),
  })) as NormalizedPatientMedicationRow[];

  const anonymizedPatientIdByRawId = buildAnonymousPatientIds(patients);
  const anonymizedVisitIdByRawId = new Map(visits.map((visit, index) => [visit.id, `V${String(index + 1).padStart(5, '0')}`]));

  const scoreByVisitId = new Map(scores.map((score) => [score.visit_id, score]));
  const interventionsByVisitId = interventions.reduce<Map<string, InterventionRow[]>>((acc, intervention) => {
    const list = acc.get(intervention.visit_id) ?? [];
    list.push(intervention);
    acc.set(intervention.visit_id, list);
    return acc;
  }, new Map());

  const questionnaireByVisitAndType = questionnaires.reduce<Map<string, Map<string, QuestionnaireRow>>>((acc, item) => {
    if (!acc.has(item.visit_id)) acc.set(item.visit_id, new Map());
    acc.get(item.visit_id)?.set(item.questionnaire_type, item);
    return acc;
  }, new Map());

  const activeMedicationByPatientId = patientMedications.reduce<Map<string, NormalizedPatientMedicationRow[]>>((acc, medication) => {
    if (!medication.is_active) return acc;
    const list = acc.get(medication.patient_id) ?? [];
    list.push(medication);
    acc.set(medication.patient_id, list);
    return acc;
  }, new Map());

  const patientsCsvRows = patients.map((patient) => {
    const patientVisits = visits.filter((v) => v.patient_id === patient.id);
    const baselineVisitId = getLatestVisitIdByType(patientVisits, isBaselineVisitType);
    const finalVisitId = getLatestVisitIdByType(patientVisits, isFinalVisitType);

    const baselineIexpac = baselineVisitId ? questionnaireByVisitAndType.get(baselineVisitId)?.get('iexpac') : null;
    const finalIexpac = finalVisitId ? questionnaireByVisitAndType.get(finalVisitId)?.get('iexpac') : null;
    const baselineMorisky = baselineVisitId ? questionnaireByVisitAndType.get(baselineVisitId)?.get('morisky') : null;
    const finalMorisky = finalVisitId ? questionnaireByVisitAndType.get(finalVisitId)?.get('morisky') : null;
    const baselineEq5d = baselineVisitId ? questionnaireByVisitAndType.get(baselineVisitId)?.get('eq5d') : null;
    const finalEq5d = finalVisitId ? questionnaireByVisitAndType.get(finalVisitId)?.get('eq5d') : null;
    const dlqiBasal = (baselineVisitId ? questionnaireByVisitAndType.get(baselineVisitId)?.get('dlqi')?.total_score : null) ?? null;
    const dlqiFinal = (finalVisitId ? questionnaireByVisitAndType.get(finalVisitId)?.get('dlqi')?.total_score : null) ?? null;
    const evasafBasal = (baselineVisitId ? questionnaireByVisitAndType.get(baselineVisitId)?.get('evasaf')?.total_score : null) ?? null;
    const evasafFinal = (finalVisitId ? questionnaireByVisitAndType.get(finalVisitId)?.get('evasaf')?.total_score : null) ?? null;

    const iexpacBasal = baselineIexpac?.total_score ?? null;
    const iexpacFinal = finalIexpac?.total_score ?? null;
    const eq5dVasBasal = baselineEq5d?.secondary_score ?? null;
    const eq5dVasFinal = finalEq5d?.secondary_score ?? null;

    return {
      patient_id: anonymizedPatientIdByRawId.get(patient.id) ?? '',
      center_code: centerCodeOf(patient),
      study_arm: studyArmOf(patient),
      study_code: patient.study_code,
      inclusion_date: patient.inclusion_date,
      age_at_inclusion: patient.age_at_inclusion,
      sex: patient.sex,
      IEXPAC_basal: iexpacBasal,
      IEXPAC_final: iexpacFinal,
      delta_IEXPAC: iexpacBasal !== null && iexpacFinal !== null ? Number((iexpacFinal - iexpacBasal).toFixed(2)) : null,
      Morisky_basal: baselineMorisky?.total_score ?? null,
      Morisky_final: finalMorisky?.total_score ?? null,
      EQ5Dvas_basal: eq5dVasBasal,
      EQ5Dvas_final: eq5dVasFinal,
      delta_EQ5Dvas: eq5dVasBasal !== null && eq5dVasFinal !== null ? Number((eq5dVasFinal - eq5dVasBasal).toFixed(2)) : null,
      DLQI_basal: dlqiBasal,
      DLQI_banda_basal: dlqiBand(dlqiBasal) ?? '',
      DLQI_final: dlqiFinal,
      DLQI_banda_final: dlqiBand(dlqiFinal) ?? '',
      delta_DLQI: dlqiBasal !== null && dlqiFinal !== null ? dlqiFinal - dlqiBasal : null,
      EVASAF_basal: evasafBasal,
      EVASAF_final: evasafFinal,
      delta_EVASAF: evasafBasal !== null && evasafFinal !== null ? Number((evasafFinal - evasafBasal).toFixed(2)) : null,
    };
  });

  const visitsCsvRows = visits.map((visit) => ({
    visit_id: anonymizedVisitIdByRawId.get(visit.id) ?? '',
    patient_id: anonymizedPatientIdByRawId.get(visit.patient_id) ?? '',
    visit_type: visit.visit_type,
    visit_number: visit.visit_number,
    visit_date: visit.visit_date,
    scheduled_date: visit.scheduled_date,
  }));

  const stratificationCsvRows = visits.map((visit) => {
    const score = scoreByVisitId.get(visit.id);
    const q = questionnaireByVisitAndType.get(visit.id);

    return {
      visit_id: anonymizedVisitIdByRawId.get(visit.id) ?? '',
      patient_id: anonymizedPatientIdByRawId.get(visit.patient_id) ?? '',
      score_cmo: score?.score ?? null,
      nivel_cmo: score?.priority ?? null,
      IEXPAC: q?.get('iexpac')?.total_score ?? null,
      Morisky: q?.get('morisky')?.total_score ?? null,
      EQ5D_vas: q?.get('eq5d')?.secondary_score ?? null,
      DLQI: q?.get('dlqi')?.total_score ?? null,
      EVASAF: q?.get('evasaf')?.total_score ?? null,
    };
  });

  const interventionsCsvRows = interventions.map((intervention, index) => ({
    intervention_id: `I${String(index + 1).padStart(6, '0')}`,
    visit_id: anonymizedVisitIdByRawId.get(intervention.visit_id) ?? '',
    intervention_type: intervention.intervention_type,
    intervention_domain: intervention.intervention_domain,
    cmo_pillar: intervention.usual_care_code ? '' : intervention.intervention_domain ?? 'No asignado',
    priority_level: intervention.priority_level,
    delivered: intervention.delivered,
    linked_to_cmo_level: intervention.linked_to_cmo_level,
    catalog_code: intervention.catalog_code ?? '',
    catalog_version: intervention.catalog_version ?? '',
    usual_care_code: intervention.usual_care_code ?? '',
    usual_care_version: intervention.usual_care_version ?? '',
    outcome: intervention.outcome,
    notes: intervention.notes,
  }));

  const questionnairesCsvRows = questionnaires.map((q) => ({
    patient_id: q.patient_id ? (anonymizedPatientIdByRawId.get(q.patient_id) ?? '') : '',
    visit_id: anonymizedVisitIdByRawId.get(q.visit_id) ?? '',
    visit_type: q.visit_type,
    questionnaire_type: q.questionnaire_type,
    total_score: q.total_score,
    secondary_score: q.secondary_score,
    responses_raw: JSON.stringify(q.responses ?? {}),
  }));

  const datasetMaestroRows = visits.map((visit) => {
    const patient = patients.find((row) => row.id === visit.patient_id);
    const score = scoreByVisitId.get(visit.id);
    const visitInterventions = interventionsByVisitId.get(visit.id) ?? [];
    const qByType = questionnaireByVisitAndType.get(visit.id);
    const activeMedicationList = activeMedicationByPatientId.get(visit.patient_id) ?? [];
    const atcGroups = new Set(activeMedicationList.map((medication) => normalizeAtcGroup(medication.medication_catalog?.atc_code)).filter(Boolean));

    return {
      study_code: patient?.study_code ?? '',
      patient_id: anonymizedPatientIdByRawId.get(visit.patient_id) ?? '',
      center_code: centerCodeOf(patient),
      study_arm: studyArmOf(patient),
      visit_type: getVisitTypeLabel(visit.visit_type),
      visit_number: visit.visit_number,
      visit_date: visit.visit_date,
      edad: patient?.age_at_inclusion ?? null,
      sexo: patient?.sex ?? '',
      score_cmo: score?.score ?? null,
      nivel_cmo: score?.priority ?? null,
      IEXPAC: qByType?.get('iexpac')?.total_score ?? null,
      DLQI: qByType?.get('dlqi')?.total_score ?? null,
      EVASAF: qByType?.get('evasaf')?.total_score ?? null,
      Morisky: qByType?.get('morisky')?.total_score ?? null,
      EQ5D_vas: qByType?.get('eq5d')?.secondary_score ?? null,
      EQ5D_profile: String(qByType?.get('eq5d')?.responses?.profile ?? ''),
      n_intervenciones: countRealInterventions(visitInterventions),
      registro_intervenciones: interventionRecordStatus(visitInterventions),
      pilar_principal: getMainPillar(visitInterventions),
      outcome: getVisitOutcome(visitInterventions),
      fecha_inclusion: patient?.inclusion_date ?? '',
      active_medications_count: activeMedicationList.length,
      polypharmacy: activeMedicationList.length >= 5 ? 1 : 0,
      therapeutic_groups_active: [...atcGroups].sort().join('|'),
    };
  });

  let medicationRowCounter = 0;
  const medicationByVisitRows = visits.flatMap((visit) => {
    const patient = patients.find((row) => row.id === visit.patient_id);
    const activeMedicationList = (activeMedicationByPatientId.get(visit.patient_id) ?? []).filter((medication) => {
      const visitDate = visit.visit_date ?? visit.scheduled_date;
      if (!visitDate) return true;
      const started = !medication.start_date || medication.start_date <= visitDate;
      const notEnded = !medication.end_date || medication.end_date >= visitDate;
      return started && notEnded;
    });

    return activeMedicationList.map((medication) => ({
      medication_row_id: `M${String((medicationRowCounter += 1)).padStart(6, '0')}`,
      visit_id: anonymizedVisitIdByRawId.get(visit.id) ?? '',
      patient_id: anonymizedPatientIdByRawId.get(visit.patient_id) ?? '',
      study_code: patient?.study_code ?? '',
      visit_type: getVisitTypeLabel(visit.visit_type),
      visit_date: visit.visit_date ?? visit.scheduled_date ?? '',
      medication_name: medication.medication_catalog?.display_name ?? medication.selected_label_snapshot ?? '',
      active_ingredient: medication.medication_catalog?.active_ingredient ?? '',
      atc_code: medication.medication_catalog?.atc_code ?? '',
      atc_group: normalizeAtcGroup(medication.medication_catalog?.atc_code) ?? '',
      dose_text: medication.dose_text ?? '',
      frequency_text: medication.frequency_text ?? '',
      route_text: medication.route_text ?? '',
      indication: medication.indication ?? '',
      start_date: medication.start_date ?? '',
      end_date: medication.end_date ?? '',
      is_active: medication.is_active ? 1 : 0,
      selection_source: medication.selection_source ?? '',
    }));
  });

  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const cmoStratificationRows = buildStratificationExportRows(stratificationRegistryResult.data, stratificationItemsResult.data, {
    patientIdAnon: (rawId) => anonymizedPatientIdByRawId.get(rawId) ?? '',
    visitIdAnon: (rawId) => anonymizedVisitIdByRawId.get(rawId) ?? '',
    centerCode: (rawId) => centerCodeOf(patientById.get(rawId)),
    visitTypeLabel: (visitType) => getVisitTypeLabel(visitType),
  });

  const normalizedPatientsRows = normalizeRowsForExport(patientsCsvRows);
  const normalizedCmoStratificationRows = normalizeRowsForExport(cmoStratificationRows);
  const normalizedVisitsRows = normalizeRowsForExport(visitsCsvRows);
  const normalizedStratificationRows = normalizeRowsForExport(stratificationCsvRows);
  const normalizedInterventionsRows = normalizeRowsForExport(interventionsCsvRows);
  const normalizedQuestionnairesRows = normalizeRowsForExport(questionnairesCsvRows);
  const normalizedDatasetMaestroRows = normalizeRowsForExport(datasetMaestroRows);
  const normalizedMedicationByVisitRows = normalizeRowsForExport(medicationByVisitRows);

  const patientsCsv = toCsv(Object.keys(normalizedPatientsRows[0] ?? { patient_id: '' }), normalizedPatientsRows);
  const visitsCsv = toCsv(['visit_id', 'patient_id', 'visit_type', 'visit_number', 'visit_date', 'scheduled_date'], normalizedVisitsRows);
  const stratificationCsv = toCsv(Object.keys(normalizedStratificationRows[0] ?? { visit_id: '', patient_id: '' }), normalizedStratificationRows);
  const interventionsCsv = toCsv(['intervention_id', 'visit_id', 'intervention_type', 'intervention_domain', 'cmo_pillar', 'priority_level', 'delivered', 'linked_to_cmo_level', 'catalog_code', 'catalog_version', 'usual_care_code', 'usual_care_version', 'outcome', 'notes'], normalizedInterventionsRows);
  const cmoStratificationHeaders = Object.keys(normalizedCmoStratificationRows[0] ?? { stratification_id: '' });
  const cmoStratificationCsv = toCsv(cmoStratificationHeaders, normalizedCmoStratificationRows);
  const cmoDictionary = stratificationSpssDictionary();
  const cmoStratificationSps = buildSpsSyntax({
    csvFileName: 'estratificaciones_cmo.csv',
    datasetName: 'Estratificaciones CMO-DERMAPEX',
    headers: cmoStratificationHeaders,
    variableLabels: cmoDictionary.variableLabels,
    categoricalValueLabels: cmoDictionary.valueLabels,
  });
  const questionnairesCsv = toCsv(Object.keys(normalizedQuestionnairesRows[0] ?? { patient_id: '' }), normalizedQuestionnairesRows);
  const datasetMaestroCsv = toCsv(Object.keys(normalizedDatasetMaestroRows[0] ?? {}), normalizedDatasetMaestroRows);
  const medicationByVisitCsv = toCsv(Object.keys(normalizedMedicationByVisitRows[0] ?? { visit_id: '', patient_id: '' }), normalizedMedicationByVisitRows);

  const datasetMaestroSps = buildSpsSyntax({
    csvFileName: 'dataset_maestro.csv',
    datasetName: 'Dataset maestro DERMAPEX',
    headers: Object.keys(normalizedDatasetMaestroRows[0] ?? {}),
    variableLabels: {
      patient_id: 'Identificador anonimizado del paciente',
      study_arm: 'Cohorte del centro (cmo / standard)',
      visit_date: 'Fecha de visita',
      active_medications_count: 'Número de medicamentos activos',
      polypharmacy: 'Indicador de polifarmacia (>=5)',
      therapeutic_groups_active: 'Grupos terapéuticos ATC activos en la visita',
    },
    categoricalValueLabels: {
      polypharmacy: {
        '0': 'No',
        '1': 'Sí',
      },
    },
  });

  const medicationByVisitSps = buildSpsSyntax({
    csvFileName: 'medicacion_por_visita.csv',
    datasetName: 'Medicacion relacional por visita',
    headers: Object.keys(normalizedMedicationByVisitRows[0] ?? { visit_id: '', patient_id: '' }),
    variableLabels: {
      visit_id: 'Identificador anonimizado de visita',
      patient_id: 'Identificador anonimizado de paciente',
      medication_name: 'Nombre del medicamento registrado',
      atc_group: 'Grupo terapéutico ATC (primer nivel)',
      is_active: 'Medicamento activo en la fecha de la visita',
    },
    categoricalValueLabels: {
      is_active: {
        '0': 'No',
        '1': 'Sí',
      },
    },
  });

  // ── Variable labels for SAV exports ──────────────────────────────────────
  const maestroVarLabels: Record<string, string> = {
    study_code: 'Codigo de estudio',
    patient_id: 'Identificador anonimizado del paciente',
    center_code: 'Codigo de centro participante',
    study_arm: 'Cohorte del centro (cmo = AF CMO-MAPEX; standard = AF estandar)',
    visit_type: 'Tipo de visita',
    visit_number: 'Numero de visita',
    visit_date: 'Fecha de visita',
    edad: 'Edad en el momento de inclusion',
    sexo: 'Sexo',
    score_cmo: 'Puntuacion CMO total',
    nivel_cmo: 'Nivel CMO (prioridad)',
    IEXPAC: 'Puntuacion IEXPAC 0-10 (experiencia del paciente cronico, items 1-11)',
    EVASAF: 'EVASAF media de los 10 items 1-5 (resumen provisional; items en bruto en cuestionarios.csv)',
    DLQI: 'DLQI 0-30 (impacto de la enfermedad cutanea en la calidad de vida; vacio = no puntuable o no recogido)',
    Morisky: 'Puntuacion Morisky (adherencia)',
    EQ5D_vas: 'EQ5D VAS (calidad de vida)',
    EQ5D_profile: 'Perfil EQ5D',
    n_intervenciones: 'Numero de intervenciones en la visita (excluye el marcador Sin intervencion)',
    registro_intervenciones: 'Registro de intervenciones: sin_registro / sin_intervencion / con_intervencion',
    pilar_principal: 'Pilar CMO dominante',
    outcome: 'Desenlace de intervencion',
    fecha_inclusion: 'Fecha de inclusion en el estudio',
    active_medications_count: 'Numero de medicamentos activos',
    polypharmacy: 'Indicador de polifarmacia (5 o mas medicamentos)',
    therapeutic_groups_active: 'Grupos terapeuticos ATC activos',
  };

  const maestroValueLabels: Record<string, Record<string, string>> = {
    polypharmacy: { '0': 'No', '1': 'Si' },
  };

  const medVarLabels: Record<string, string> = {
    medication_row_id: 'Identificador de fila de medicacion',
    visit_id: 'Identificador anonimizado de visita',
    patient_id: 'Identificador anonimizado de paciente',
    study_code: 'Codigo de estudio',
    visit_type: 'Tipo de visita',
    visit_date: 'Fecha de visita',
    medication_name: 'Nombre del medicamento',
    active_ingredient: 'Principio activo',
    atc_code: 'Codigo ATC completo',
    atc_group: 'Grupo terapeutico ATC (primer nivel)',
    dose_text: 'Dosis',
    frequency_text: 'Frecuencia de administracion',
    route_text: 'Via de administracion',
    indication: 'Indicacion',
    start_date: 'Fecha de inicio',
    end_date: 'Fecha de fin',
    is_active: 'Medicamento activo en la visita',
    selection_source: 'Fuente de seleccion',
  };

  const medValueLabels: Record<string, Record<string, string>> = {
    is_active: { '0': 'No', '1': 'Si' },
  };

  // ── Downloads ─────────────────────────────────────────────────────────────

  downloadCsv('pacientes.csv', patientsCsv);
  downloadCsv('visitas.csv', visitsCsv);
  downloadCsv('estratificaciones.csv', stratificationCsv);
  downloadCsv('intervenciones.csv', interventionsCsv);
  downloadCsv('cuestionarios.csv', questionnairesCsv);
  downloadCsv('dataset_maestro.csv', datasetMaestroCsv);
  downloadCsv('estratificaciones_cmo.csv', cmoStratificationCsv);
  downloadTextFile('estratificaciones_cmo.sps', cmoStratificationSps);
  downloadCsv('medicacion_por_visita.csv', medicationByVisitCsv);
  downloadTextFile('dataset_maestro.sps', datasetMaestroSps);
  downloadTextFile('medicacion_por_visita.sps', medicationByVisitSps);

  // XLSX real via SheetJS
  const xlsxBinary = buildXlsx([
    { name: 'Pacientes', rows: normalizedPatientsRows },
    { name: 'Visitas', rows: normalizedVisitsRows },
    { name: 'Estratificacion', rows: normalizedStratificationRows },
    { name: 'EstratificacionCMO', rows: normalizedCmoStratificationRows },
    { name: 'Intervenciones', rows: normalizedInterventionsRows },
    { name: 'Medicacion', rows: normalizedMedicationByVisitRows },
    { name: 'Cuestionarios', rows: normalizedQuestionnairesRows },
    { name: 'DatasetMaestro', rows: normalizedDatasetMaestroRows },
  ]);
  downloadBinaryFile('investigacion_dermapex.xlsx', xlsxBinary, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  // SPSS SAV binarios reales (dataset_maestro + medicacion_por_visita)
  const maestroHeaders = Object.keys(normalizedDatasetMaestroRows[0] ?? {});
  if (maestroHeaders.length > 0) {
    const maestroSav = buildSavFile(maestroHeaders, maestroVarLabels, maestroValueLabels, normalizedDatasetMaestroRows, 'Dataset Maestro DERMAPEX');
    downloadBinaryFile('dataset_maestro.sav', maestroSav, 'application/x-spss-sav');
  }

  if (normalizedCmoStratificationRows.length > 0) {
    const cmoSav = buildSavFile(cmoStratificationHeaders, cmoDictionary.variableLabels, cmoDictionary.valueLabels, normalizedCmoStratificationRows, 'Estratificaciones CMO-DERMAPEX');
    downloadBinaryFile('estratificaciones_cmo.sav', cmoSav, 'application/x-spss-sav');
  }

  const medHeaders = Object.keys(normalizedMedicationByVisitRows[0] ?? {});
  if (medHeaders.length > 0) {
    const medSav = buildSavFile(medHeaders, medVarLabels, medValueLabels, normalizedMedicationByVisitRows, 'Medicacion por Visita DERMAPEX');
    downloadBinaryFile('medicacion_por_visita.sav', medSav, 'application/x-spss-sav');
  }

  return {
    success: true,
    errorMessage: null,
    generatedFiles: [
      'pacientes.csv',
      'visitas.csv',
      'estratificaciones.csv',
      'intervenciones.csv',
      'cuestionarios.csv',
      'dataset_maestro.csv',
      'estratificaciones_cmo.csv',
      'estratificaciones_cmo.sps',
      'estratificaciones_cmo.sav',
      'medicacion_por_visita.csv',
      'dataset_maestro.sps',
      'medicacion_por_visita.sps',
      'investigacion_dermapex.xlsx',
      'dataset_maestro.sav',
      'medicacion_por_visita.sav',
    ],
  };
}
