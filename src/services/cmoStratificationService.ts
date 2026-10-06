// Servicio de estratificación CMO-DERMAPEX.
//
// - Valida el borrador (motivo obligatorio D6; respuesta explícita sí/no/desconocido en cada variable).
// - Calcula con el motor puro (cmoScoringEngine.scoreCmo).
// - Guarda en UNA operación atómica mediante la función de base de datos save_cmo_stratification,
//   que vuelve a calcular en servidor desde el catálogo versionado y rechaza cualquier discrepancia.
//   No quedan registros a medias: puntuación e ítems se escriben en la misma transacción.
// - Lee el historial a través de las vistas cmo_stratification_registry / _item_values, que
//   enmascaran los resultados para los centros del brazo estándar (D5).
// Sin IA ni extracción automática: solo puntúan valores confirmados por el farmacéutico. Sin localStorage.

import { CMO_ANSWER_FIELDS, CMO_INFORMATIVE_FIELDS } from '../constants/cmoDermapexModel';
import {
  COMPARATOR_STRATIFICATION_VISIBLE,
  REQUIRE_EXPLICIT_ANSWER_FOR_EVERY_VARIABLE,
  STRATIFICATION_REASONS,
  type StratificationReason,
  type StudyArm,
} from '../constants/dermapexStudyConfig';
import type { SexType } from '../constants/enums';
import { supabase } from '../lib/supabase';
import { CMO_ENGINE_VERSION, CMO_MODEL_VERSION, scoreCmo, UNKNOWN, type CmoLevel, type CmoScoringResult } from './cmoScoringEngine';
import type { ProfileRole } from './profileService';

export type StratificationDraft = {
  visitId: string;
  reason: StratificationReason | '';
  /** patients.age_at_inclusion (el servidor la vuelve a leer de la ficha). */
  age: number | null;
  answers: Record<string, string | undefined>;
  informative: Record<string, string | undefined>;
};

export type StratificationRegistryRow = {
  id: string;
  visit_id: string;
  patient_id: string;
  center_id: string;
  study_arm: StudyArm | null;
  visit_type: string | null;
  visit_number: number | null;
  visit_date: string | null;
  scheduled_date: string | null;
  stratification_reason: StratificationReason | null;
  engine_version: string | null;
  model_version: string | null;
  incomplete: boolean | null;
  unknown_count: number;
  unknown_variables: string[];
  created_at: string;
  updated_at: string;
  results_visible: boolean;
  /** NULL si el usuario no puede ver resultados CMO (centros del brazo estándar). */
  score: number | null;
  priority: CmoLevel | null;
  special_rule_applied: boolean | null;
  block_scores: Array<{ block: string; points: number }> | null;
};

export type StratificationItemValueRow = {
  id: string;
  cmo_score_id: string;
  visit_id: string;
  variable_code: string;
  label: string;
  block: string;
  sort_order: number;
  is_scored: boolean;
  model_version: string | null;
  raw_value: { value: string; age?: number | null } | null;
  /** NULL si el usuario no puede ver resultados CMO. */
  item_score: number | null;
};

const REGISTRY_SELECT =
  'id,visit_id,patient_id,center_id,study_arm,visit_type,visit_number,visit_date,scheduled_date,stratification_reason,engine_version,model_version,incomplete,unknown_count,unknown_variables,created_at,updated_at,results_visible,score,priority,special_rule_applied,block_scores';

const ITEM_SELECT = 'id,cmo_score_id,visit_id,variable_code,label,block,sort_order,is_scored,model_version,raw_value,item_score';

function extractError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// ── Reglas puras (testeadas en tests/cmoStratificationService.test.ts) ──────

/**
 * ¿Se pueden MOSTRAR resultados CMO (puntuación, nivel, paquete, catálogo)? Coordinación siempre;
 * centros 'cmo' sí; centros 'standard' no (D5). La base de datos lo impone de todos modos: si este
 * flag se activara sin migración, la interfaz recibiría resultados vacíos.
 */
export function canViewCmoResults(arm: StudyArm | null | undefined, role: ProfileRole | null | undefined): boolean {
  if (role === 'coordinator') return true;
  if (arm === 'cmo') return true;
  return arm === 'standard' && COMPARATOR_STRATIFICATION_VISIBLE;
}

/** Valor precargado de «Sexo femenino» desde la ficha (editable; el farmacéutico lo confirma). */
export function prefillSexAnswer(sex: SexType | null | undefined): string | undefined {
  if (sex === 'female') return 'si';
  if (sex === 'male') return 'no';
  return undefined;
}

export function missingAnswerCodes(draft: Pick<StratificationDraft, 'answers' | 'informative'>): string[] {
  const missing = CMO_ANSWER_FIELDS.filter((f) => !draft.answers[f.code]).map((f) => f.code);
  const missingInformative = CMO_INFORMATIVE_FIELDS.filter((f) => !draft.informative[f.code]).map((f) => f.code);
  return [...missing, ...missingInformative];
}

export function validateDraft(draft: StratificationDraft): string[] {
  const errors: string[] = [];
  if (!draft.visitId) errors.push('Falta la visita.');
  if (!draft.reason || !STRATIFICATION_REASONS.some((r) => r.value === draft.reason)) {
    errors.push('Selecciona el motivo de la estratificación.');
  }
  if (REQUIRE_EXPLICIT_ANSWER_FOR_EVERY_VARIABLE) {
    const missing = missingAnswerCodes(draft);
    if (missing.length > 0) {
      errors.push(`Responde todas las variables (Sí / No / Desconocido). Pendientes: ${missing.length}.`);
    }
  }
  return errors;
}

/** Resultado del motor para el borrador (las variables sin responder se tratan como desconocidas). */
export function computeDraft(draft: Pick<StratificationDraft, 'age' | 'answers' | 'informative'>): CmoScoringResult {
  const answers: Record<string, string> = {};
  for (const field of CMO_ANSWER_FIELDS) answers[field.code] = draft.answers[field.code] ?? UNKNOWN;
  const informative: Record<string, string> = {};
  for (const field of CMO_INFORMATIVE_FIELDS) informative[field.code] = draft.informative[field.code] ?? UNKNOWN;
  return scoreCmo({ age: draft.age, answers, informative });
}

/** Parámetros de save_cmo_stratification (las respuestas incluyen la variable informativa). */
export function buildSavePayload(draft: StratificationDraft, result: CmoScoringResult) {
  const answers: Record<string, string> = {};
  for (const field of CMO_ANSWER_FIELDS) answers[field.code] = draft.answers[field.code] ?? UNKNOWN;
  for (const field of CMO_INFORMATIVE_FIELDS) answers[field.code] = draft.informative[field.code] ?? UNKNOWN;
  return {
    p_visit_id: draft.visitId,
    p_reason: draft.reason,
    p_model_version: result.modelVersion,
    p_engine_version: result.engineVersion,
    p_answers: answers,
    p_client_total: result.totalScore,
    p_client_level: result.level,
  };
}

/** Reconstruye las respuestas de un registro guardado (para revisar o reestratificar la visita). */
export function draftAnswersFromItems(items: StratificationItemValueRow[]): Pick<StratificationDraft, 'answers' | 'informative'> {
  const answers: Record<string, string> = {};
  const informative: Record<string, string> = {};
  for (const item of items) {
    const value = item.raw_value?.value;
    if (!value) continue;
    if (CMO_ANSWER_FIELDS.some((f) => f.code === item.variable_code)) answers[item.variable_code] = value;
    if (CMO_INFORMATIVE_FIELDS.some((f) => f.code === item.variable_code)) informative[item.variable_code] = value;
  }
  return { answers, informative };
}

// ── Acceso a datos ──────────────────────────────────────────────────────────

export async function saveCmoStratification(
  draft: StratificationDraft,
): Promise<{ scoreId: string | null; result: CmoScoringResult | null; errorMessage: string | null }> {
  const errors = validateDraft(draft);
  if (errors.length > 0) return { scoreId: null, result: null, errorMessage: errors.join(' ') };
  if (!supabase) return { scoreId: null, result: null, errorMessage: 'Supabase no está configurado.' };

  let result: CmoScoringResult;
  try {
    result = computeDraft(draft);
  } catch (err) {
    return { scoreId: null, result: null, errorMessage: extractError(err, 'Entrada de estratificación no válida.') };
  }

  const { data, error } = await supabase.rpc('save_cmo_stratification', buildSavePayload(draft, result));
  if (error) {
    return { scoreId: null, result: null, errorMessage: extractError(error, 'No se pudo guardar la estratificación.') };
  }
  return { scoreId: (data as string | null) ?? null, result, errorMessage: null };
}

export async function getVisitStratification(
  visitId: string,
): Promise<{ registry: StratificationRegistryRow | null; items: StratificationItemValueRow[]; errorMessage: string | null }> {
  if (!supabase) return { registry: null, items: [], errorMessage: 'Supabase no está configurado.' };

  const [registryResult, itemsResult] = await Promise.all([
    supabase.from('cmo_stratification_registry').select(REGISTRY_SELECT).eq('visit_id', visitId).maybeSingle(),
    supabase.from('cmo_stratification_item_values').select(ITEM_SELECT).eq('visit_id', visitId).order('sort_order', { ascending: true }),
  ]);
  const error = registryResult.error ?? itemsResult.error;
  if (error) return { registry: null, items: [], errorMessage: extractError(error, 'No se pudo cargar la estratificación.') };

  return {
    registry: (registryResult.data as StratificationRegistryRow | null) ?? null,
    items: (itemsResult.data ?? []) as StratificationItemValueRow[],
    errorMessage: null,
  };
}

/** Historial de estratificaciones del paciente, más reciente primero (por fecha de visita y de registro). */
export async function listPatientStratifications(
  patientId: string,
): Promise<{ data: StratificationRegistryRow[]; errorMessage: string | null }> {
  if (!supabase) return { data: [], errorMessage: 'Supabase no está configurado.' };

  const { data, error } = await supabase
    .from('cmo_stratification_registry')
    .select(REGISTRY_SELECT)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], errorMessage: extractError(error, 'No se pudo cargar el historial de estratificaciones.') };

  const rows = (data ?? []) as StratificationRegistryRow[];
  return { data: sortStratificationsDesc(rows), errorMessage: null };
}

export function sortStratificationsDesc<T extends Pick<StratificationRegistryRow, 'visit_date' | 'scheduled_date' | 'created_at'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const byDate = (b.visit_date ?? b.scheduled_date ?? '').localeCompare(a.visit_date ?? a.scheduled_date ?? '');
    return byDate !== 0 ? byDate : b.created_at.localeCompare(a.created_at);
  });
}

export { CMO_ENGINE_VERSION, CMO_MODEL_VERSION };
