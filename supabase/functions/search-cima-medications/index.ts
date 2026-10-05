const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type CimaSearchRequest = {
  query?: string;
  limit?: number;
};

type CimaItem = Record<string, unknown>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }

        if (entry && typeof entry === 'object') {
          const name = cleanString((entry as Record<string, unknown>).nombre);
          const code = cleanString((entry as Record<string, unknown>).codigo);
          return name ?? code ?? null;
        }

        return null;
      })
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(/[;,|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function extractItems(responseData: unknown): CimaItem[] {
  if (Array.isArray(responseData)) {
    return responseData.filter((entry): entry is CimaItem => Boolean(entry && typeof entry === 'object'));
  }

  if (!responseData || typeof responseData !== 'object') {
    return [];
  }

  const asRecord = responseData as Record<string, unknown>;
  const candidates = ['resultados', 'results', 'medicamentos', 'contenido', 'items'];

  for (const key of candidates) {
    const value = asRecord[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is CimaItem => Boolean(entry && typeof entry === 'object'));
    }
  }

  return [];
}

function normalizeCimaMedication(item: CimaItem, fetchedAt: string) {
  const cimaCn = cleanString(item.cn);
  const cimaNRegistro = cleanString(item.nregistro);
  const cimaName = cleanString(item.nombre) ?? 'Medicamento CIMA';
  const labtitular = cleanString(item.labtitular);
  const authorizationStatus = cleanString(item.estado);
  const pharmaceuticalForm = cleanString((item.formaFarmaceutica as Record<string, unknown> | undefined)?.nombre ?? item.formaFarmaceutica);
  const pharmaceuticalFormSimplified = cleanString(
    (item.formaFarmaceuticaSimplificada as Record<string, unknown> | undefined)?.nombre ?? item.formaFarmaceuticaSimplificada,
  );
  const atcCodes = toStringArray(item.atcs).length > 0 ? toStringArray(item.atcs) : toStringArray(item.atc);
  const routes =
    toStringArray(item.viasAdministracion).length > 0
      ? toStringArray(item.viasAdministracion)
      : toStringArray(item.viaAdministracion);

  return {
    id: cimaCn ?? cimaNRegistro ?? cimaName,
    source: 'external_cima_remote' as const,
    source_label: 'CIMA remoto',
    cima_cn: cimaCn,
    cima_nregistro: cimaNRegistro,
    cima_name: cimaName,
    labtitular,
    pharmaceutical_form: pharmaceuticalForm,
    pharmaceutical_form_simplified: pharmaceuticalFormSimplified,
    routes,
    atc_codes: atcCodes,
    authorization_status: authorizationStatus,
    commercialized: typeof item.comerc === 'boolean' ? item.comerc : null,
    vmpp: cleanString(item.vmpp),
    vmp: cleanString(item.vmp),
    dose: cleanString(item.dosis),
    raw_payload: item,
    fetched_at: fetchedAt,
  };
}

async function searchCima(query: string, limit: number) {
  const endpoint = new URL('https://cima.aemps.es/cima/rest/medicamentos');
  endpoint.searchParams.set('nombre', query);
  endpoint.searchParams.set('comerc', '1');
  endpoint.searchParams.set('autorizados', '1');

  const response = await fetch(endpoint.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`CIMA respondió con estado ${response.status}.`);
  }

  const json = await response.json();
  const items = extractItems(json);
  const fetchedAt = new Date().toISOString();

  return items.slice(0, limit).map((item) => normalizeCimaMedication(item, fetchedAt));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const body = (await request.json()) as CimaSearchRequest;
    const query = (body.query ?? '').trim();
    const limit = Math.max(1, Math.min(50, Number(body.limit ?? 20)));

    if (query.length < 2) {
      return jsonResponse(200, { items: [] });
    }

    const items = await searchCima(query, limit);
    return jsonResponse(200, { items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return jsonResponse(502, { error: message });
  }
});
