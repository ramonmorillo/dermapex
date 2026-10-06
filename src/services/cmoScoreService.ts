import { supabase } from '../lib/supabase';

export type CmoScoreRecord = {
  id: string;
  visit_id: string;
  score: number;
  priority: 1 | 2 | 3;
  factors: unknown;
  recommendations: unknown;
  engine_version?: string | null;
  stratification_reason?: string | null;
  special_rule_applied?: boolean | null;
  incomplete?: boolean | null;
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

// La ESCRITURA de puntuaciones se hace exclusivamente con cmoStratificationService.saveCmoStratification
// (función de BD save_cmo_stratification, atómica y verificada en servidor). La antigua escritura
// directa (upsert + ítems «best effort») se ha retirado: la base de datos ya no la admite.
//
// Lecturas: la RLS solo devuelve filas a coordinación y a centros de la cohorte CMO (D5). Para un
// centro del brazo estándar estas funciones devuelven vacío; su registro se consulta con las vistas
// enmascaradas (cmoStratificationService).

const SCORE_SELECT =
  'id,visit_id,score,priority,factors,recommendations,engine_version,stratification_reason,special_rule_applied,incomplete,calculated_by,created_at,updated_at';

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
