import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

export type ResettableInvestigator = {
  id: string;
  full_name: string | null;
  email: string | null;
  center_codes: string[];
  must_change_password: boolean;
  /** false si la cuenta no tiene correo confirmado o está suspendida. */
  eligible: boolean;
};

export type PasswordResetResult = { email: string; temporary_password: string };

const FUNCTION_NAME = 'admin-reset-password';

async function errorMessageFrom(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* cuerpo no JSON: se usa el mensaje genérico */
    }
  }
  return fallback;
}

/**
 * Operaciones administrativas de cuentas. La autorización (coordinación DERMAPEX activa) la verifica la
 * Edge Function en el servidor; que la pantalla solo se muestre a coordinación es una comodidad de interfaz.
 */
export async function listResettableInvestigators(): Promise<{ data: ResettableInvestigator[]; errorMessage: string | null }> {
  if (!supabase) return { data: [], errorMessage: 'Supabase no está configurado.' };
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { action: 'list' } });
  if (error) return { data: [], errorMessage: await errorMessageFrom(error, 'No se pudo obtener el listado de investigadores.') };
  return { data: ((data as { users?: ResettableInvestigator[] })?.users ?? []), errorMessage: null };
}

/** La contraseña temporal solo viaja en esta respuesta: no se guarda en ningún almacenamiento. */
export async function resetInvestigatorPassword(userId: string): Promise<{ data: PasswordResetResult | null; errorMessage: string | null }> {
  if (!supabase) return { data: null, errorMessage: 'Supabase no está configurado.' };
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { action: 'reset', user_id: userId } });
  if (error) return { data: null, errorMessage: await errorMessageFrom(error, 'No se pudo restablecer la contraseña.') };
  const result = data as Partial<PasswordResetResult> | null;
  if (!result?.temporary_password || !result.email) return { data: null, errorMessage: 'Respuesta no válida del servidor.' };
  return { data: { email: result.email, temporary_password: result.temporary_password }, errorMessage: null };
}
