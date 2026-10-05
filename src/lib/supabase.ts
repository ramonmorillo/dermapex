import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;
