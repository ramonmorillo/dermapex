import { supabase } from '../lib/supabase';

export type ProfileRole = 'investigator' | 'coordinator';

export type CurrentProfile = {
  id: string;
  full_name: string | null;
  role: ProfileRole;
};

/**
 * Perfil del usuario autenticado. El rol solo se usa para decidir qué se MUESTRA (p. ej. resultados
 * CMO del brazo estándar a coordinación); el control de acceso real lo hace la RLS en la base de datos.
 */
export async function getCurrentProfile(): Promise<{ data: CurrentProfile | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado.' };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, errorMessage: 'Usuario no autenticado.' };
  }

  const { data, error } = await supabase.from('profiles').select('id,full_name,role').eq('id', user.id).maybeSingle();
  if (error) {
    return { data: null, errorMessage: error.message };
  }
  return { data: (data as CurrentProfile | null) ?? null, errorMessage: null };
}
