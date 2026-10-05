import type { AuthChangeEvent, AuthError, Session, Subscription, User } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

export type AuthResult = {
  user: User | null;
  session: Session | null;
  error: AuthError | Error | null;
};

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) {
    return {
      user: null,
      session: null,
      error: new Error('Supabase no está configurado en variables de entorno.'),
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  return {
    user: data.user,
    session: data.session,
    error,
  };
}

export async function getCurrentSession(): Promise<{ session: Session | null; error: AuthError | null }> {
  if (!supabase) {
    return { session: null, error: null };
  }

  const { data, error } = await supabase.auth.getSession();
  return { session: data.session, error };
}

export function subscribeToAuthChanges(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): Subscription | null {
  if (!supabase) {
    return null;
  }

  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  if (!supabase) {
    return { error: null };
  }

  return supabase.auth.signOut();
}

/** Establece la sesión recibida en un enlace de invitación o recuperación de contraseña. */
export async function setSessionFromAuthLink(accessToken: string, refreshToken: string): Promise<AuthResult> {
  if (!supabase) {
    return { user: null, session: null, error: new Error('Supabase no está configurado en variables de entorno.') };
  }

  const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return { user: data.user, session: data.session, error };
}

export async function updatePassword(password: string): Promise<{ error: AuthError | Error | null }> {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado en variables de entorno.') };
  }

  const { error } = await supabase.auth.updateUser({ password });
  return { error };
}

/** Envía el correo de recuperación. La respuesta no revela si el email existe. */
export async function requestPasswordReset(email: string, redirectTo: string): Promise<{ error: AuthError | Error | null }> {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado en variables de entorno.') };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  return { error };
}
