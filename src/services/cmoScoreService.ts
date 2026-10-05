import { supabase } from '../lib/supabase';
import type { CmoScoringResult } from './cmoScoringEngine';

export type CmoScoreRecord = {
  id: string;
  visit_id: string;
  score: number;
  priority: 1 | 2 | 3;
  factors: unknown;
  recommendations: unknown;
  calculated_by: string;
  created_at: string;
  updated_at: string;
};

function extractError(err: unknown): string {
  if (
    err !== null &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message;
  }
  return 'Error desconocido al guardar la puntuación CMO.';
}

/**
 * Upserts the CMO score for a visit and persists per-variable item results.
 *
 * Idempotent: repeated calls for the same visitId overwrite the existing record.
 *
 * Item results require matching entries in cmo_variable_catalog. Any triggered
 * variable whose code has no catalog entry is captured in cmo_scores.factors
 * and silently skipped from cmo_score_item_results (catalog population is an
 * admin concern, not a clinician concern).
 */
export async function upsertCmoScore(
  visitId: string,
  result: CmoScoringResult,
): Promise<{ data: CmoScoreRecord | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado.' };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, errorMessage: 'Usuario no autenticado. Inicia sesión e inténtalo de nuevo.' };
  }

  // Ensure profile exists for the authenticated user before persisting rows
  // that reference profiles(id) through calculated_by/scored_by.
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        full_name: (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null),
      },
      { onConflict: 'id' },
    );

  if (profileError) {
    return {
      data: null,
      errorMessage: 'No se pudo preparar el perfil del usuario para registrar la puntuación CMO.',
    };
  }

  // ── 1. Upsert cmo_scores ─────────────────────────────────────────────────
  // factors stores the full triggered-variable snapshot for traceability even
  // when cmo_variable_catalog has no entries for the variable codes.
  const factors = result.triggeredVariables.map((v) => ({
    code: v.code,
    label: v.label,
    points: v.points,
    rationale: v.rationale,
  }));

  const { data: scoreData, error: scoreError } = await supabase
    .from('cmo_scores')
    .upsert(
      {
        visit_id: visitId,
        score: result.totalScore,
        priority: result.level,
        factors,
        recommendations: [],
        calculated_by: user.id,
      },
      { onConflict: 'visit_id' },
    )
    .select('id,visit_id,score,priority,factors,recommendations,calculated_by,created_at,updated_at')
    .maybeSingle();

  if (scoreError) {
    return { data: null, errorMessage: extractError(scoreError) };
  }
  if (!scoreData) {
    return { data: null, errorMessage: 'No se pudo recuperar el registro de puntuación tras guardarlo.' };
  }

  const scoreId = (scoreData as { id: string }).id;

  // ── 2. Persist item results (best-effort — requires catalog entries) ──────
  if (result.triggeredVariables.length > 0) {
    const codes = result.triggeredVariables.map((v) => v.code);

    const { data: catalogRows } = await supabase
      .from('cmo_variable_catalog')
      .select('id,variable_code')
      .in('variable_code', codes);

    if (catalogRows && catalogRows.length > 0) {
      const codeToId = new Map<string, string>(
        (catalogRows as Array<{ id: string; variable_code: string }>).map((r) => [r.variable_code, r.id]),
      );

      // Delete existing items for this score before re-inserting so repeated
      // saves produce exactly one row per variable, not accumulating duplicates.
      await supabase
        .from('cmo_score_item_results')
        .delete()
        .eq('cmo_score_id', scoreId);

      const itemRows = result.triggeredVariables
        .filter((v) => codeToId.has(v.code))
        .map((v) => ({
          cmo_score_id: scoreId,
          visit_id: visitId,
          variable_id: codeToId.get(v.code) as string,
          source_question_code: v.code,
          raw_value: { value: v.rawValue },
          item_score: v.points,
          scored_by: user.id,
        }));

      if (itemRows.length > 0) {
        await supabase.from('cmo_score_item_results').insert(itemRows);
        // Errors from item insertion are intentionally not surfaced to the user.
        // The score is already persisted in cmo_scores; item results are for
        // analytical traceability and require admin-managed catalog entries.
      }
    }
  }

  return { data: scoreData as CmoScoreRecord, errorMessage: null };
}

const SCORE_SELECT =
  'id,visit_id,score,priority,factors,recommendations,calculated_by,created_at,updated_at';

/** Returns the saved CMO score for a specific visit, or null if none exists yet. */
export async function getCmoScoreByVisit(
  visitId: string,
): Promise<{ data: CmoScoreRecord | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado.' };
  }

  const { data, error } = await supabase
    .from('cmo_scores')
    .select(SCORE_SELECT)
    .eq('visit_id', visitId)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractError(error) };
  }

  return { data: (data as CmoScoreRecord | null) ?? null, errorMessage: null };
}

export type CmoScoreHistoryEntry = CmoScoreRecord & {
  visit_date: string | null;
  scheduled_date: string | null;
  visit_number: number | null;
};

/** Returns all CMO scores for a patient ordered newest first, with visit date context. */
export async function listCmoScoresByPatient(
  patientId: string,
): Promise<{ data: CmoScoreHistoryEntry[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado.' };
  }

  const { data, error } = await supabase
    .from('cmo_scores')
    .select(`${SCORE_SELECT},visits!inner(patient_id,visit_date,scheduled_date,visit_number)`)
    .eq('visits.patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], errorMessage: extractError(error) };
  }

  const rows = ((data ?? []) as Array<CmoScoreRecord & {
    visits: { patient_id: string; visit_date: string | null; scheduled_date: string | null; visit_number: number | null } |
            Array<{ patient_id: string; visit_date: string | null; scheduled_date: string | null; visit_number: number | null }>;
  }>).map((r) => {
    const v = Array.isArray(r.visits) ? r.visits[0] : r.visits;
    return {
      ...r,
      visit_date: v?.visit_date ?? null,
      scheduled_date: v?.scheduled_date ?? null,
      visit_number: v?.visit_number ?? null,
    };
  });

  return { data: rows as CmoScoreHistoryEntry[], errorMessage: null };
}

/** Returns the most recent saved CMO score across all visits for a patient. */
export async function getLatestCmoScoreByPatient(
  patientId: string,
): Promise<{ data: CmoScoreRecord | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado.' };
  }

  const { data, error } = await supabase
    .from('cmo_scores')
    .select(`${SCORE_SELECT},visits!inner(patient_id)`)
    .eq('visits.patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractError(error) };
  }

  return { data: (data as CmoScoreRecord | null) ?? null, errorMessage: null };
}
