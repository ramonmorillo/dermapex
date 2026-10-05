// Enlaces de autenticación de Supabase (invitación y recuperación de contraseña).
//
// Supabase devuelve los tokens en el fragmento de la URL (#access_token=…&type=invite). La app usa
// HashRouter, que interpretaría ese fragmento como una ruta y lo descartaría. Por eso el fragmento se
// lee de forma síncrona, ANTES de crear el router, se elimina de la URL (para que el token no quede en
// el historial) y se redirige a la pantalla de fijar contraseña.

export type AuthLinkType = 'invite' | 'recovery' | 'signup' | 'magiclink' | 'email_change';

export type PendingAuthLink =
  | { kind: 'session'; type: AuthLinkType | string; accessToken: string; refreshToken: string }
  | { kind: 'error'; description: string };

function readPendingAuthLink(): PendingAuthLink | null {
  if (typeof window === 'undefined') return null;

  const rawHash = window.location.hash.replace(/^#\/?/, '');
  if (!rawHash.includes('access_token=') && !rawHash.includes('error_description=')) return null;

  const params = new URLSearchParams(rawHash);
  const basePath = `${window.location.pathname}${window.location.search}`;

  const errorDescription = params.get('error_description');
  if (errorDescription) {
    window.history.replaceState(null, '', `${basePath}#/login`);
    return { kind: 'error', description: errorDescription.replace(/\+/g, ' ') };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;

  window.history.replaceState(null, '', `${basePath}#/set-password`);
  return { kind: 'session', type: params.get('type') ?? 'unknown', accessToken, refreshToken };
}

let pendingAuthLink: PendingAuthLink | null = readPendingAuthLink();

/** Devuelve el enlace pendiente una sola vez (los tokens no se conservan en memoria tras usarse). */
export function consumePendingAuthLink(): PendingAuthLink | null {
  const link = pendingAuthLink;
  pendingAuthLink = null;
  return link;
}

/** URL a la que Supabase debe redirigir tras invitación o recuperación (raíz de la app publicada). */
export function getAuthRedirectUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}
