import { supabase } from '../lib/supabase';

export type PriorityLevel = 'low' | 'medium' | 'high';

export type Intervention = {
  id: string;
  visit_id: string;
  intervention_type: string;
  intervention_domain: string | null;
  priority_level: PriorityLevel | null;
  delivered: boolean | null;
  linked_to_cmo_level: number | null;
  outcome: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type NewInterventionInput = Omit<Intervention, 'id' | 'created_at' | 'updated_at'>;
export type UpdateInterventionInput = Partial<Omit<Intervention, 'id' | 'visit_id' | 'created_at' | 'updated_at'>>;

const INTERVENTION_SELECT =
  'id,visit_id,intervention_type,intervention_domain,priority_level,delivered,linked_to_cmo_level,outcome,notes,created_at,updated_at';

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Error desconocido al procesar intervenciones.';
}

export async function listInterventionsByVisit(visitId: string) {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar intervenciones.' };
  }

  const { data, error } = await supabase
    .from('interventions')
    .select(INTERVENTION_SELECT)
    .eq('visit_id', visitId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return { data: (data ?? []) as Intervention[], errorMessage: null };
}

export async function listInterventionsByPatient(patientId: string) {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar intervenciones.' };
  }

  const { data, error } = await supabase
    .from('interventions')
    .select(`${INTERVENTION_SELECT},visits!inner(patient_id,visit_date)`)
    .eq('visits.patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  type RawRow = Intervention & {
    visits:
      | { patient_id: string; visit_date: string | null }
      | Array<{ patient_id: string; visit_date: string | null }>;
  };
  const normalized = ((data ?? []) as RawRow[]).map((item) => ({
    ...item,
    visits: Array.isArray(item.visits) ? item.visits[0] : item.visits,
  }));

  return {
    data: normalized as Array<Intervention & { visits: { patient_id: string; visit_date: string | null } }>,
    errorMessage: null,
  };
}

export async function createIntervention(input: NewInterventionInput) {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede guardar la intervención.' };
  }
  const { data, error } = await supabase.from('interventions').insert(input).select(INTERVENTION_SELECT).maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as Intervention | null) ?? null, errorMessage: null };
}


export async function updateIntervention(id: string, input: UpdateInterventionInput) {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede actualizar la intervención.' };
  }

  const { data, error } = await supabase
    .from('interventions')
    .update(input)
    .eq('id', id)
    .select(INTERVENTION_SELECT)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as Intervention | null) ?? null, errorMessage: null };
}
