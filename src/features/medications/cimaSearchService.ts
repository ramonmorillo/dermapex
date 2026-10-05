import { supabase } from '../../lib/supabase';

export type CimaMedicationSearchDto = {
  id: string;
  source: 'external_cima_remote';
  source_label: string;
  cima_cn: string | null;
  cima_nregistro: string | null;
  cima_name: string;
  labtitular: string | null;
  pharmaceutical_form: string | null;
  pharmaceutical_form_simplified: string | null;
  routes: string[];
  atc_codes: string[];
  authorization_status: string | null;
  commercialized: boolean | null;
  vmpp: string | null;
  vmp: string | null;
  dose: string | null;
  raw_payload: Record<string, unknown>;
  fetched_at: string;
};

type SearchResult<T> = {
  data: T;
  errorMessage: string | null;
};

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function mapRemoteItem(item: unknown): CimaMedicationSearchDto | null {
  const record = readRecord(item);
  if (!record) {
    return null;
  }

  const rawPayload =
    readRecord(record.raw_payload) ??
    readRecord(record.raw) ??
    record;

  const option = readRecord(record.option);
  const raw = readRecord(record.raw) ?? rawPayload;

  const cimaName =
    readString(record.cima_name) ??
    readString(option?.label) ??
    readString(raw?.nombre) ??
    'Medicamento externo';

  return {
    id: readString(record.id) ?? readString(record.cima_cn) ?? readString(record.cima_nregistro) ?? cimaName,
    source: 'external_cima_remote',
    source_label: readString(record.source_label) ?? 'CIMA remoto',
    cima_cn: readString(record.cima_cn),
    cima_nregistro: readString(record.cima_nregistro),
    cima_name: cimaName,
    labtitular: readString(record.labtitular),
    pharmaceutical_form: readString(record.pharmaceutical_form),
    pharmaceutical_form_simplified: readString(record.pharmaceutical_form_simplified),
    routes: readStringArray(record.routes),
    atc_codes: readStringArray(record.atc_codes),
    authorization_status: readString(record.authorization_status),
    commercialized: typeof record.commercialized === 'boolean' ? record.commercialized : null,
    vmpp: readString(record.vmpp),
    vmp: readString(record.vmp),
    dose: readString(record.dose),
    raw_payload: rawPayload,
    fetched_at: readString(record.fetched_at) ?? new Date().toISOString(),
  };
}

function asErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export async function searchRemoteCimaMedications(query: string): Promise<SearchResult<CimaMedicationSearchDto[]>> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se puede consultar CIMA en remoto.',
    };
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { data: [], errorMessage: null };
  }

  const { data, error } = await supabase.functions.invoke('search-cima-medications', {
    body: {
      query: trimmed,
      limit: 20,
    },
  });

  if (error) {
    return {
      data: [],
      errorMessage: asErrorMessage(error, 'No fue posible consultar CIMA en remoto.'),
    };
  }

  if (!data || typeof data !== 'object' || !Array.isArray((data as { items?: unknown[] }).items)) {
    return {
      data: [],
      errorMessage: 'Respuesta inválida al consultar CIMA.',
    };
  }

  return {
    data: ((data as { items: unknown[] }).items ?? [])
      .map(mapRemoteItem)
      .filter((item): item is CimaMedicationSearchDto => Boolean(item)),
    errorMessage: null,
  };
}
