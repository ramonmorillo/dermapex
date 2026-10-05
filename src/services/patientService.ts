import { supabase } from '../lib/supabase';
import type { SexType } from '../constants/enums';

// Paciente seudonimizado: solo código de estudio. Sin identificadores directos ni fecha de nacimiento
// (la edad se calcula en el cliente). Ver supabase/migrations/20261005100100_dermapex_clinical_core.sql.
export type Patient = {
  id: string;
  center_id: string;
  study_code: string;
  inclusion_date: string | null;
  screening_date: string | null;
  age_at_inclusion: number | null;
  sex: SexType | null;
  consent_signed: boolean | null;
  created_at?: string;
  center?: { id: string; code: string; name: string } | null;
};

export type NewPatientInput = Omit<Patient, 'id' | 'created_at' | 'center'>;

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Error desconocido al procesar pacientes.';
}

type PatientRow = Omit<Patient, 'center'> & { center?: Patient['center'] | Array<NonNullable<Patient['center']>> };

// PostgREST devuelve la relación muchos-a-uno como objeto, pero sin tipos generados supabase-js la
// tipa como lista: se normaliza a objeto en un único punto.
function normalizePatient(row: PatientRow): Patient {
  const center = Array.isArray(row.center) ? (row.center[0] ?? null) : (row.center ?? null);
  return { ...row, center };
}

const PATIENT_SELECT =
  'id,center_id,study_code,inclusion_date,screening_date,age_at_inclusion,sex,consent_signed,created_at,center:centers(id,code,name)';

export async function listPatients(searchStudyCode?: string): Promise<{ data: Patient[]; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se pueden cargar pacientes.',
    };
  }

  let query = supabase.from('patients').select(PATIENT_SELECT).order('created_at', { ascending: false });

  if (searchStudyCode?.trim()) {
    query = query.ilike('study_code', `%${searchStudyCode.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return { data: ((data ?? []) as unknown as PatientRow[]).map(normalizePatient), errorMessage: null };
}

export async function getPatientById(id: string): Promise<{ data: Patient | null; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede cargar la ficha del paciente.',
    };
  }

  const { data, error } = await supabase.from('patients').select(PATIENT_SELECT).eq('id', id).maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: data ? normalizePatient(data as unknown as PatientRow) : null, errorMessage: null };
}

export async function createPatient(input: NewPatientInput): Promise<{ data: Patient | null; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede guardar el paciente.',
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, errorMessage: 'Usuario no autenticado. Inicia sesión e inténtalo de nuevo.' };
  }

  const { data, error } = await supabase.from('patients').insert({ ...input, created_by: user.id }).select(PATIENT_SELECT).maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: data ? normalizePatient(data as unknown as PatientRow) : null, errorMessage: null };
}

export async function deletePatientById(id: string): Promise<{ success: boolean; errorMessage: string | null }> {
  if (!supabase) {
    return {
      success: false,
      errorMessage: 'Supabase no está configurado. No se puede eliminar el paciente.',
    };
  }

  // Las visitas y registros dependientes se eliminan en cascada en la base de datos y quedan auditados.
  // La RLS solo permite el borrado a coordinación: un borrado sin filas afectadas indica falta de permiso.
  const { data, error } = await supabase.from('patients').delete().eq('id', id).select('id');

  if (error) {
    return { success: false, errorMessage: extractErrorMessage(error) };
  }

  if (!data || data.length === 0) {
    return {
      success: false,
      errorMessage: 'No se eliminó el paciente: solo la coordinación del estudio puede eliminar pacientes.',
    };
  }

  return { success: true, errorMessage: null };
}
