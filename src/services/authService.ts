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
