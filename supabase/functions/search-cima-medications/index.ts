// Edge Function: búsqueda en CIMA (AEMPS) para la medicación del paciente. Proxy de una API pública
// gratuita (evita CORS en el navegador). Requiere usuario autenticado (verify_jwt por defecto).
// La transformación de datos vive en cimaMapping.ts (probada en tests/cimaMapping.test.ts).
import { buildCimaSearchUrls, extractItems, mergeCimaResults, normalizeCimaMedication } from './cimaMapping.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CIMA_TIMEOUT_MS = 10000;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function fetchCima(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CIMA_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (response.status === 204) return { resultados: [] };
    if (!response.ok) throw new Error(`CIMA respondió con estado ${response.status}.`);
    const text = await response.text();
    return text.trim() ? JSON.parse(text) : { resultados: [] };
  } finally {
    clearTimeout(timer);
  }
}

// El proyecto Supabase lo comparten DERMAPEX y COAMO (mismo Auth). verify_jwt solo prueba que la
// sesión es del proyecto, no que la cuenta esté autorizada en DERMAPEX. Se comprueba con la propia
// RLS: con el JWT del usuario, una cuenta DERMAPEX ve al menos su perfil; cualquier otra, ninguno
// (política restrictiva dermapex_app_gate, migración 20261007130000).
async function hasDermapexAccess(request: Request): Promise<boolean> {
  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // La clave pública que envía el propio cliente (supabase-js) o, en su defecto, la del entorno.
  const apiKey = request.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!authorization || !supabaseUrl || !apiKey) return false;

  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
    headers: { apikey: apiKey, Authorization: authorization, Accept: 'application/json' },
  });
  if (!response.ok) return false;
  const rows = (await response.json()) as unknown;
  return Array.isArray(rows) && rows.length > 0;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Método no permitido' });

  try {
    if (!(await hasDermapexAccess(request))) {
      return jsonResponse(403, { error: 'Cuenta no autorizada en DERMAPEX.' });
    }

    const body = (await request.json()) as { query?: string; limit?: number };
    const query = (body.query ?? '').trim();
    const limit = Math.max(1, Math.min(50, Number(body.limit ?? 20)));
    if (query.length < 2) return jsonResponse(200, { items: [] });

    const fetchedAt = new Date().toISOString();
    const settled = await Promise.allSettled(buildCimaSearchUrls(query).map(fetchCima));
    const lists = settled
      .filter((result): result is PromiseFulfilledResult<unknown> => result.status === 'fulfilled')
      .map((result) => extractItems(result.value).map((item) => normalizeCimaMedication(item, fetchedAt)));

    if (lists.length === 0) {
      const reason = settled.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
      const message = reason?.reason instanceof Error ? reason.reason.message : 'CIMA no disponible.';
      return jsonResponse(502, { error: `No se pudo consultar CIMA: ${message}` });
    }

    return jsonResponse(200, { items: mergeCimaResults(lists, limit) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return jsonResponse(502, { error: `No se pudo consultar CIMA: ${message}` });
  }
});
