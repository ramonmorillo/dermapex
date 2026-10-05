import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Debe evaluarse antes que el router: captura y limpia los tokens de invitación/recuperación de la URL.
import './authLinks';

export type SupabaseEnvStatus = {
  isConfigured: boolean;
  missingVars: Array<'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'>;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const missingVars: SupabaseEnvStatus['missingVars'] = [];

if (!supabaseUrl) {
  missingVars.push('VITE_SUPABASE_URL');
}
if (!supabaseAnonKey) {
  missingVars.push('VITE_SUPABASE_ANON_KEY');
}

export const supabaseEnvStatus: SupabaseEnvStatus = {
  isConfigured: missingVars.length === 0,
  missingVars,
};

export const supabase: SupabaseClient | null = supabaseEnvStatus.isConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      // Los enlaces de invitación/recuperación se procesan de forma explícita en authLinks.ts.
      auth: { detectSessionInUrl: false },
    })
  : null;
