import { supabase } from '../lib/supabase';
import type { VisitStatus, VisitType } from '../constants/enums';
import { getVisitNumberByType, getVisitTypeSortOrder, normalizeVisitTypeValue } from '../constants/enums';

export type Visit = {
  id: string;
  patient_id: string;
  visit_type: VisitType;
  visit_number: number | null;
  scheduled_date: string | null;
  visit_date: string | null;
  visit_status: VisitStatus | null;
  extraordinary_reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
};

export type NewVisitInput = Omit<Visit, 'id' | 'created_at' | 'updated_at' | 'created_by'>;

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Error desconocido al procesar visitas.';
}

const VISIT_SELECT =
  'id,patient_id,visit_type,visit_number,scheduled_date,visit_date,visit_status,extraordinary_reason,notes,created_by,created_at,updated_at';

function visitSortKey(dateLike: string | null): number {
  return dateLike ? new Date(dateLike).getTime() : Number.MAX_SAFE_INTEGER;
}

function normalizeVisit(record: Visit): Visit {
  const normalizedType = normalizeVisitTypeValue(record.visit_type) as VisitType;

  return {
    ...record,
    visit_type: normalizedType,
    visit_number: record.visit_number ?? getVisitNumberByType(normalizedType),
  };
}

function compareVisitsChronologically(a: Visit, b: Visit): number {
  const byDate = visitSortKey(a.visit_date ?? a.scheduled_date) - visitSortKey(b.visit_date ?? b.scheduled_date);
  if (byDate !== 0) return byDate;

  const byVisitNumber = (a.visit_number ?? Number.MAX_SAFE_INTEGER) - (b.visit_number ?? Number.MAX_SAFE_INTEGER);
  if (byVisitNumber !== 0) return byVisitNumber;

  const byType = getVisitTypeSortOrder(a.visit_type) - getVisitTypeSortOrder(b.visit_type);
  if (byType !== 0) return byType;

  return (a.created_at ?? '').localeCompare(b.created_at ?? '');
}

export async function listVisitsByPatient(patientId: string): Promise<{ data: Visit[]; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se pueden cargar visitas.',
    };
  }

  const { data, error } = await supabase
    .from('visits')
    .select(VISIT_SELECT)
    .eq('patient_id', patientId);

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  const normalizedVisits = ((data ?? []) as Visit[]).map(normalizeVisit).sort(compareVisitsChronologically);

  return { data: normalizedVisits, errorMessage: null };
}


export async function getVisitById(visitId: string): Promise<{ data: Visit | null; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede cargar la visita.',
    };
  }

  const { data, error } = await supabase.from('visits').select(VISIT_SELECT).eq('id', visitId).maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: data ? normalizeVisit(data as Visit) : null, errorMessage: null };
}

export async function createVisit(input: NewVisitInput): Promise<{ data: Visit | null; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede guardar la visita.',
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, errorMessage: 'Usuario no autenticado. Inicia sesión e inténtalo de nuevo.' };
  }

  const normalizedType = normalizeVisitTypeValue(input.visit_type) as VisitType;
  const { data, error } = await supabase
    .from('visits')
    .insert({
      ...input,
      visit_type: normalizedType,
      visit_number: getVisitNumberByType(normalizedType),
      created_by: user.id,
    })
    .select(VISIT_SELECT)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: data ? normalizeVisit(data as Visit) : null, errorMessage: null };
}

export type VisitUpdateInput = Partial<Pick<Visit, 'visit_type' | 'visit_number' | 'visit_date' | 'visit_status' | 'notes' | 'scheduled_date' | 'extraordinary_reason'>>;

export async function updateVisit(visitId: string, updates: VisitUpdateInput): Promise<{ data: Visit | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede actualizar la visita.' };
  }

  const { data, error } = await supabase
    .from('visits')
    .update(updates)
    .eq('id', visitId)
    .select(VISIT_SELECT)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: data ? normalizeVisit(data as Visit) : null, errorMessage: null };
}
