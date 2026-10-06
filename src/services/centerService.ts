import { supabase } from '../lib/supabase';

export type Center = {
  id: string;
  code: string;
  name: string;
  /** Número del centro en el código de estudio (DPX-<n>-NNNN). null = sin asignar: no admite altas. */
  study_number: number | null;
};

/**
 * Centros activos a los que el usuario tiene acceso. La RLS limita el resultado a los centros
 * del investigador (o a todos, para coordinación).
 */
export async function listAccessibleCenters(): Promise<{ data: Center[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar los centros.' };
  }

  const { data, error } = await supabase
    .from('centers')
    .select('id,code,name,study_number')
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (error) {
    return { data: [], errorMessage: error.message };
  }

  return { data: (data ?? []) as Center[], errorMessage: null };
}
