// Edge Function: restablecimiento administrativo de contraseña de un investigador DERMAPEX.
//
// Seguridad (todo se decide en el servidor; la interfaz solo oculta el acceso a quien no es coordinación):
//   1. verify_jwt = true (la plataforma rechaza peticiones sin JWT del proyecto) Y, además, el JWT se
//      verifica contra Auth (auth.getUser) para obtener la identidad real del solicitante.
//   2. La autorización (coordinación DERMAPEX activa; destino = investigador DERMAPEX activo, distinto
//      del solicitante) la hacen las funciones public.admin_pwreset_* (migración 20261119100000), que
//      solo ejecuta service_role.
//   3. La clave service_role (SUPABASE_SERVICE_ROLE_KEY) la inyecta la plataforma en el entorno de la
//      función: no está en el frontend, en GitHub ni en ningún archivo del repositorio.
//   4. La contraseña temporal se genera aquí (Web Crypto), se aplica con auth.admin.updateUserById y se
//      devuelve UNA vez en la respuesta. No se registra, no se guarda y no va en la URL.
//   5. Se marca must_change_password = true ANTES de cambiar la contraseña; se registra la operación
//      (quién, a quién, cuándo, resultado) sin contraseñas ni tokens.
import { createClient } from 'npm:@supabase/supabase-js@2.53.0';

import { generateTemporaryPassword } from './passwordGenerator.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      // La respuesta puede contener una contraseña temporal: nunca debe cachearse.
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json(405, { error: 'Método no permitido' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Función no configurada.' });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return json(401, { error: 'Sesión no válida.' });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Identidad real del solicitante: el JWT se valida contra Auth, no solo se decodifica.
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller.user) return json(401, { error: 'Sesión no válida.' });
  const actorId = caller.user.id;

  let body: { action?: unknown; user_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Petición no válida.' });
  }

  // ── Listado de investigadores restablecibles ──
  if (body.action === 'list') {
    const { data, error } = await admin.rpc('admin_pwreset_candidates', { p_actor: actorId });
    if (error) return json(error.code === '42501' ? 403 : 500, { error: error.code === '42501' ? 'No autorizado.' : 'No se pudo obtener el listado.' });

    const rows = (data ?? []) as Array<{ id: string; full_name: string | null; must_change_password: boolean; center_codes: string[] }>;
    const users = await Promise.all(
      rows.map(async (row) => {
        const { data: authUser } = await admin.auth.admin.getUserById(row.id);
        const u = authUser?.user;
        return {
          id: row.id,
          full_name: row.full_name,
          email: u?.email ?? null,
          center_codes: row.center_codes,
          must_change_password: row.must_change_password,
          // Sin correo confirmado, o suspendida/borrada, la cuenta no es restablecible.
          eligible: Boolean(u && u.email && u.email_confirmed_at && !u.deleted_at && !isBanned(u.banned_until)),
        };
      }),
    );
    return json(200, { users });
  }

  // ── Restablecimiento ──
  if (body.action === 'reset') {
    const targetId = typeof body.user_id === 'string' ? body.user_id : '';
    if (!UUID_RE.test(targetId)) return json(400, { error: 'Identificador de usuario no válido.' });

    // 1) Autorización + indicador must_change_password = true + registro de inicio (todo en la BD).
    const begin = await admin.rpc('admin_pwreset_begin', { p_actor: actorId, p_target: targetId });
    if (begin.error) {
      if (begin.error.code === '42501') return json(403, { error: 'No autorizado.' });
      if (begin.error.code === '54000') return json(429, { error: 'Demasiados restablecimientos en la última hora.' });
      return json(500, { error: 'No se pudo iniciar el restablecimiento.' });
    }

    const { data: target } = await admin.auth.admin.getUserById(targetId);
    const u = target?.user;
    if (!u || !u.email || !u.email_confirmed_at || u.deleted_at || isBanned(u.banned_until)) {
      await admin.rpc('admin_pwreset_complete', { p_actor: actorId, p_target: targetId, p_ok: false });
      return json(409, { error: 'La cuenta no está confirmada o está suspendida.' });
    }

    // 2) Contraseña temporal y cambio en Auth (mismo UUID; no se toca nada más de la cuenta).
    const temporaryPassword = generateTemporaryPassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(targetId, { password: temporaryPassword });
    if (updateError) {
      await admin.rpc('admin_pwreset_complete', { p_actor: actorId, p_target: targetId, p_ok: false });
      return json(500, { error: 'No se pudo cambiar la contraseña.' });
    }

    // 3) Registro del resultado y cierre de sesiones previas.
    const complete = await admin.rpc('admin_pwreset_complete', { p_actor: actorId, p_target: targetId, p_ok: true });
    if (complete.error) {
      // La contraseña YA se cambió y el cambio obligatorio ya estaba marcado: se entrega igualmente.
      console.error('admin-reset-password: no se pudo registrar el cierre', complete.error.code);
    }

    return json(200, { email: u.email, temporary_password: temporaryPassword });
  }

  return json(400, { error: 'Acción no válida.' });
});

function isBanned(bannedUntil: string | null | undefined): boolean {
  return Boolean(bannedUntil) && new Date(bannedUntil as string).getTime() > Date.now();
}
