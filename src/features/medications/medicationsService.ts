import { supabase } from '../../lib/supabase';
import { getVisitById } from '../../services/visitService';
import { searchRemoteCimaMedications } from './cimaSearchService';
import { normalizeMedicationCatalogSource } from './catalogSource';
import { mapExternalMedicationPayloadToNormalizedCandidate, upsertNormalizedMedicationFromExternal } from './normalizedCatalog';
import type { MedicationCatalogItem, MedicationEventType, PatientMedication, PatientMedicationDraft, VisitMedicationEvent } from './types';

type ServiceResult<T> = { data: T; errorMessage: string | null };
type NullableServiceResult<T> = { data: T | null; errorMessage: string | null };

type SaveVisitMedicationInput = {
  visitId: string;
  patientId: string;
  rows: PatientMedicationDraft[];
};

type CreateMedicationCatalogItemInput = {
  display_name: string;
  active_ingredient?: string;
  strength?: string;
  form?: string;
  route?: string;
};

type CreateMedicationCatalogItemResult = {
  item: MedicationCatalogItem | null;
  duplicate: MedicationCatalogItem | null;
};
type CanonicalCatalogSource = 'external_cima' | 'manual';

const PATIENT_MEDICATION_SELECT =
  'id,patient_id,medication_catalog_id,catalog_concept_id,catalog_product_id,selection_source,selected_label_snapshot,selected_source_payload,dose_text,frequency_text,route_text,indication,start_date,end_date,is_active,notes,created_at,updated_at,medication_catalog:medication_catalog_id(id,source,source_code,display_name,active_ingredient,strength,form,route,atc_code,created_at,updated_at)';

function debugMedicationCatalogOperation(operationName: string, payload: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.debug('[medication_catalog operation]', operationName);
    console.debug('[medication_catalog payload]', payload);
  }
}

export type ExternalMedicationSearchItem = {
  id: string;
  label: string;
  source: 'external_cima';
  sourceLabel: 'CIMA (cache local)' | 'CIMA (remoto)';
  sourceCode: string | null;
  payload: Record<string, unknown>;
};

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

function trimOrNull(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function medicationSnapshot(payload: {
  medication_catalog_id: string;
  dose_text: string | null;
  frequency_text: string | null;
  route_text: string | null;
  indication: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
}): Record<string, unknown> {
  return {
    medication_catalog_id: payload.medication_catalog_id,
    dose_text: payload.dose_text,
    frequency_text: payload.frequency_text,
    route_text: payload.route_text,
    indication: payload.indication,
    start_date: payload.start_date,
    end_date: payload.end_date,
    is_active: payload.is_active,
    notes: payload.notes,
  };
}


function normalizePatientMedication(record: PatientMedication & { medication_catalog?: MedicationCatalogItem | MedicationCatalogItem[] }): PatientMedication {
  const medicationCatalog = Array.isArray(record.medication_catalog) ? record.medication_catalog[0] : record.medication_catalog;
  return {
    ...record,
    medication_catalog: medicationCatalog
      ? {
          ...medicationCatalog,
          source: normalizeMedicationCatalogSource(medicationCatalog.source),
        }
      : undefined,
  };
}

function normalizeMedicationCatalogItem(record: MedicationCatalogItem): MedicationCatalogItem {
  return {
    ...record,
    source: normalizeMedicationCatalogSource(record.source),
  };
}

function buildExternalMedicationLabel(payload: Record<string, unknown>): string {
  const name = typeof payload.cima_name === 'string' && payload.cima_name.trim().length > 0 ? payload.cima_name.trim() : 'Medicamento externo';
  return name;
}

function normalizeMedicationName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function canonicalizeManualSource(source: string | null | undefined): CanonicalCatalogSource {
  const normalized = (source ?? '').trim().toLowerCase();
  if (normalized === 'external_cima') {
    return 'external_cima';
  }
  if (normalized === 'manual' || normalized === 'non_cima' || normalized === 'no_cima' || normalized === 'custom' || normalized === 'local') {
    return 'manual';
  }
  return 'manual';
}

async function ensureMedicationCatalogItem(params: {
  catalogItemId?: string | null;
  source: string | null | undefined;
  sourceCode?: string | null;
  displayName: string;
  activeIngredient?: string | null;
  strength?: string | null;
  form?: string | null;
  route?: string | null;
  atcCode?: string | null;
}): Promise<NullableServiceResult<MedicationCatalogItem>> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado.' };
  }

  if (params.catalogItemId) {
    return { data: { id: params.catalogItemId } as MedicationCatalogItem, errorMessage: null };
  }

  const canonicalSource = canonicalizeManualSource(params.source);
  const displayName = params.displayName.trim();
  if (displayName.length < 2) {
    return { data: null, errorMessage: 'El nombre del medicamento debe tener al menos 2 caracteres.' };
  }

  const sourceCode = canonicalSource === 'external_cima'
    ? trimOrNull(params.sourceCode ?? '')
    : null;

  if (canonicalSource === 'external_cima' && !sourceCode) {
    return { data: null, errorMessage: 'El medicamento CIMA requiere source_code válido.' };
  }

  if (canonicalSource === 'external_cima') {
    const { data: existingBySourceCode, error: existingBySourceCodeError } = await supabase
      .from('medication_catalog')
      .select('id,source,source_code,display_name,active_ingredient,strength,form,route,atc_code,created_at,updated_at')
      .eq('source', 'external_cima')
      .eq('source_code', sourceCode)
      .maybeSingle();

    if (existingBySourceCodeError) {
      return { data: null, errorMessage: extractErrorMessage(existingBySourceCodeError, 'No fue posible consultar medicación CIMA existente.') };
    }
    if (existingBySourceCode) {
      return { data: normalizeMedicationCatalogItem(existingBySourceCode as MedicationCatalogItem), errorMessage: null };
    }
  } else {
    const normalizedDisplayName = normalizeMedicationName(displayName);
    const { data: possibleDuplicates, error: duplicateError } = await supabase
      .from('medication_catalog')
      .select('id,source,source_code,display_name,active_ingredient,strength,form,route,atc_code,created_at,updated_at')
      .eq('source', 'manual')
      .ilike('display_name', `%${displayName}%`)
      .limit(40);

    if (duplicateError) {
      return { data: null, errorMessage: extractErrorMessage(duplicateError, 'No fue posible verificar duplicados del catálogo manual.') };
    }

    const duplicate = ((possibleDuplicates ?? []) as MedicationCatalogItem[])
      .map(normalizeMedicationCatalogItem)
      .find((candidate) => normalizeMedicationName(candidate.display_name) === normalizedDisplayName);
    if (duplicate) {
      return { data: duplicate, errorMessage: null };
    }
  }

  const insertPayload = {
    source: canonicalSource,
    source_code: sourceCode,
    display_name: displayName,
    active_ingredient: trimOrNull(params.activeIngredient ?? ''),
    strength: trimOrNull(params.strength ?? ''),
    form: trimOrNull(params.form ?? ''),
    route: trimOrNull(params.route ?? ''),
    atc_code: trimOrNull(params.atcCode ?? ''),
  };
  debugMedicationCatalogOperation('ensureMedicationCatalogItem.insert', insertPayload);

  const { data, error } = await supabase
    .from('medication_catalog')
    .insert(insertPayload)
    .select('id,source,source_code,display_name,active_ingredient,strength,form,route,atc_code,created_at,updated_at')
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error, 'No fue posible crear el medicamento en catálogo local.') };
  }

  return {
    data: data ? normalizeMedicationCatalogItem(data as MedicationCatalogItem) : null,
    errorMessage: null,
  };
}

function normalizeVisitMedicationEvent(
  record: VisitMedicationEvent & {
    patient_medication?: { id: string; medication_catalog?: { display_name: string } | { display_name: string }[] } | Array<{
      id: string;
      medication_catalog?: { display_name: string } | { display_name: string }[];
    }>;
  },
): VisitMedicationEvent {
  const normalizedMedication = Array.isArray(record.patient_medication) ? record.patient_medication[0] : record.patient_medication;
  const normalizedCatalog = Array.isArray(normalizedMedication?.medication_catalog)
    ? normalizedMedication.medication_catalog[0]
    : normalizedMedication?.medication_catalog;

  return {
    ...record,
    patient_medication: normalizedMedication
      ? {
          id: normalizedMedication.id,
          medication_catalog: normalizedCatalog ?? null,
        }
      : null,
  };
}

function hasMedicationChanged(previous: PatientMedication, next: ReturnType<typeof medicationSnapshot>): boolean {
  const oldSnapshot = medicationSnapshot({
    medication_catalog_id: previous.medication_catalog_id,
    dose_text: previous.dose_text,
    frequency_text: previous.frequency_text,
    route_text: previous.route_text,
    indication: previous.indication,
    start_date: previous.start_date,
    end_date: previous.end_date,
    is_active: previous.is_active,
    notes: previous.notes,
  });

  return JSON.stringify(oldSnapshot) !== JSON.stringify(next);
}

export async function searchMedicationCatalog(query: string): Promise<ServiceResult<MedicationCatalogItem[]>> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se puede consultar el catálogo.' };
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { data: [], errorMessage: null };
  }

  let request = supabase
    .from('medication_catalog')
    .select('id,source,source_code,display_name,active_ingredient,strength,form,route,atc_code,created_at,updated_at')
    .order('display_name', { ascending: true })
    .limit(20);

  request = request.or(`display_name.ilike.%${trimmed}%,active_ingredient.ilike.%${trimmed}%`);

  const { data, error } = await request;

  if (error) {
    return {
      data: [],
      errorMessage: extractErrorMessage(error, 'No fue posible buscar medicamentos en el catálogo.'),
    };
  }

  return {
    data: ((data ?? []) as MedicationCatalogItem[]).map(normalizeMedicationCatalogItem),
    errorMessage: null,
  };
}

export async function searchExternalMedicationCatalog(query: string): Promise<ServiceResult<ExternalMedicationSearchItem[]>> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se puede consultar catálogo externo.' };
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { data: [], errorMessage: null };
  }

  const request = supabase
    .from('med_catalog_products')
    .select(
      'id,source,cima_cn,cima_nregistro,cima_name,labtitular,pharmaceutical_form,routes,atc_codes,authorization_status,commercialized,raw_payload,last_synced_at',
    )
    .eq('source', 'external_cima')
    .order('cima_name', { ascending: true })
    .limit(20)
    .or(`cima_name.ilike.%${trimmed}%,cima_cn.ilike.%${trimmed}%,cima_nregistro.ilike.%${trimmed}%`);

  const { data, error } = await request;

  if (error) {
    return {
      data: [],
      errorMessage: extractErrorMessage(error, 'No fue posible buscar medicamentos externos.'),
    };
  }

  const localMapped = ((data ?? []) as Array<Record<string, unknown>>).map((item) => {
    const payload: Record<string, unknown> = {
      ...(typeof item.raw_payload === 'object' && item.raw_payload ? (item.raw_payload as Record<string, unknown>) : {}),
      source: 'external_cima',
      cima_cn: typeof item.cima_cn === 'string' ? item.cima_cn : null,
      cima_nregistro: typeof item.cima_nregistro === 'string' ? item.cima_nregistro : null,
      cima_name: typeof item.cima_name === 'string' ? item.cima_name : null,
      labtitular: typeof item.labtitular === 'string' ? item.labtitular : null,
      pharmaceutical_form: typeof item.pharmaceutical_form === 'string' ? item.pharmaceutical_form : null,
      routes: Array.isArray(item.routes) ? item.routes : [],
      atc_codes: Array.isArray(item.atc_codes) ? item.atc_codes : [],
      authorization_status: typeof item.authorization_status === 'string' ? item.authorization_status : null,
      commercialized: typeof item.commercialized === 'boolean' ? item.commercialized : null,
      last_synced_at: typeof item.last_synced_at === 'string' ? item.last_synced_at : null,
    };

    return {
      id: `local:${String(item.id)}`,
      label: buildExternalMedicationLabel(payload),
      source: 'external_cima' as const,
      sourceLabel: 'CIMA (cache local)' as const,
      sourceCode: typeof payload.cima_cn === 'string' ? payload.cima_cn : null,
      payload,
    };
  });

  const remoteResult = await searchRemoteCimaMedications(trimmed);
  if (remoteResult.errorMessage) {
    return {
      data: localMapped,
      errorMessage:
        localMapped.length > 0
          ? `CIMA remoto no disponible ahora mismo. Mostrando solo caché local. Detalle: ${remoteResult.errorMessage}`
          : remoteResult.errorMessage,
    };
  }

  const knownExternalCodes = new Set(
    localMapped
      .map((item) => (typeof item.payload.cima_cn === 'string' ? item.payload.cima_cn.trim() : ''))
      .filter((value) => value.length > 0),
  );

  const remoteMapped: ExternalMedicationSearchItem[] = remoteResult.data
    .filter((item) => !item.cima_cn || !knownExternalCodes.has(item.cima_cn.trim()))
    .map((item) => {
      const payload: Record<string, unknown> = {
        ...item.raw_payload,
        source: 'external_cima',
        cima_cn: item.cima_cn,
        cima_nregistro: item.cima_nregistro,
        cima_name: item.cima_name,
        labtitular: item.labtitular,
        pharmaceutical_form: item.pharmaceutical_form,
        pharmaceutical_form_simplified: item.pharmaceutical_form_simplified,
        routes: item.routes,
        atc_codes: item.atc_codes,
        authorization_status: item.authorization_status,
        commercialized: item.commercialized,
        vmpp: item.vmpp,
        vmp: item.vmp,
        dose: item.dose,
        fetched_at: item.fetched_at,
      };

      return {
        id: `remote:${item.id}`,
        label: buildExternalMedicationLabel(payload),
        source: 'external_cima',
        sourceLabel: 'CIMA (remoto)',
        sourceCode: item.cima_cn,
        payload,
      };
    });

  return { data: [...localMapped, ...remoteMapped], errorMessage: null };
}

async function ensureExternalMedicationCatalogItem(params: {
  sourceCode: string | null;
  displayName: string;
  candidate: ReturnType<typeof mapExternalMedicationPayloadToNormalizedCandidate>;
}): Promise<NullableServiceResult<MedicationCatalogItem>> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado.' };
  }

  return ensureMedicationCatalogItem({
    source: 'external_cima',
    sourceCode: params.sourceCode,
    displayName: params.displayName,
    activeIngredient: params.candidate.ingredientNames.join(' + ') || null,
    strength: params.candidate.strengthText,
    form: params.candidate.pharmaceuticalForm,
    route: params.candidate.routeDefault,
    atcCode: params.candidate.atcCodes[0] ?? null,
  });
}

export async function importExternalMedicationToVisit(input: {
  visitId: string;
  patientId: string;
  selectedLabel: string;
  sourcePayload: Record<string, unknown>;
}): Promise<ServiceResult<PatientMedication[]> & { newMedicationId: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se puede importar medicación externa.', newMedicationId: null };
  }

  const candidate = mapExternalMedicationPayloadToNormalizedCandidate(input.sourcePayload);
  const normalizedSelectedLabel = input.selectedLabel.trim();
  const resolvedDisplayName = normalizedSelectedLabel.length > 0
    ? normalizedSelectedLabel
    : buildExternalMedicationLabel(input.sourcePayload).trim() || 'Medicamento CIMA';
  const normalizedResult = await upsertNormalizedMedicationFromExternal(candidate);
  if (normalizedResult.errorMessage || !normalizedResult.data) {
    return { data: [], errorMessage: normalizedResult.errorMessage ?? 'No se pudo normalizar el medicamento externo.', newMedicationId: null };
  }

  const sourceCode = (candidate.cimaCn ?? normalizedResult.data.productId ?? '').trim() || null;
  const localCatalogResult = await ensureExternalMedicationCatalogItem({
    sourceCode,
    displayName: resolvedDisplayName,
    candidate,
  });
  if (localCatalogResult.errorMessage || !localCatalogResult.data) {
    return { data: [], errorMessage: localCatalogResult.errorMessage ?? 'No se pudo enlazar el catálogo local.', newMedicationId: null };
  }

  const insertPayload = {
    patient_id: input.patientId,
    medication_catalog_id: localCatalogResult.data.id,
    catalog_concept_id: normalizedResult.data.conceptId,
    catalog_product_id: normalizedResult.data.productId,
    selection_source: 'external_cima',
    selected_label_snapshot: resolvedDisplayName,
    selected_source_payload: input.sourcePayload,
    dose_text: null,
    frequency_text: null,
    route_text: null,
    indication: null,
    start_date: null,
    end_date: null,
    is_active: true,
    notes: null,
  };

  const { data, error } = await supabase
    .from('patient_medications')
    .insert(insertPayload)
    .select(PATIENT_MEDICATION_SELECT)
    .maybeSingle();

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error, 'No fue posible añadir la medicación externa al paciente.'), newMedicationId: null };
  }

  const persisted = data
    ? normalizePatientMedication(data as PatientMedication & { medication_catalog?: MedicationCatalogItem | MedicationCatalogItem[] })
    : null;

  if (persisted) {
    const { error: eventError } = await supabase.from('visit_medication_events').insert({
      visit_id: input.visitId,
      patient_medication_id: persisted.id,
      event_type: 'added',
      old_value: null,
      new_value: {
        medication_catalog_id: persisted.medication_catalog_id,
        catalog_concept_id: persisted.catalog_concept_id ?? null,
        catalog_product_id: persisted.catalog_product_id ?? null,
        selection_source: persisted.selection_source ?? null,
      },
    });

    if (eventError) {
      return { data: [], errorMessage: extractErrorMessage(eventError, 'No fue posible registrar el evento de importación externa.'), newMedicationId: null };
    }
  }

  const refreshed = await listActivePatientMedications(input.patientId);
  if (refreshed.errorMessage) {
    return { data: [], errorMessage: refreshed.errorMessage, newMedicationId: null };
  }
  return { ...refreshed, newMedicationId: persisted?.id ?? null };
}

export async function createMedicationCatalogItem(
  input: CreateMedicationCatalogItemInput,
): Promise<ServiceResult<CreateMedicationCatalogItemResult>> {
  if (!supabase) {
    return {
      data: { item: null, duplicate: null },
      errorMessage: 'Supabase no está configurado. No se puede crear el medicamento en catálogo.',
    };
  }

  const displayName = input.display_name.trim();
  if (displayName.length < 2) {
    return {
      data: { item: null, duplicate: null },
      errorMessage: 'El nombre del medicamento debe tener al menos 2 caracteres.',
    };
  }

  const ensured = await ensureMedicationCatalogItem({
    source: 'manual',
    displayName,
    activeIngredient: input.active_ingredient,
    strength: input.strength,
    form: input.form,
    route: input.route,
  });
  if (ensured.errorMessage) {
    const rawError = ensured.errorMessage;
    const normalizedError = rawError.toLowerCase();
    const isRlsInsertError = normalizedError.includes('row-level security') || normalizedError.includes('new row violates');

    return {
      data: { item: null, duplicate: null },
      errorMessage: isRlsInsertError
        ? 'No fue posible crear la medicación no CIMA por permisos de catálogo. Revisa que tu sesión esté autenticada y vuelve a intentarlo.'
        : rawError,
    };
  }
  if (!ensured.data) {
    return { data: { item: null, duplicate: null }, errorMessage: 'No fue posible crear o reutilizar el medicamento en catálogo.' };
  }

  return {
    data: {
      item: ensured.data.source === 'manual' ? ensured.data : null,
      duplicate: ensured.data.source === 'manual' ? null : ensured.data,
    },
    errorMessage: null,
  };
}

export async function listActivePatientMedications(patientId: string): Promise<ServiceResult<PatientMedication[]>> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se puede consultar medicación activa.' };
  }

  const { data, error } = await supabase
    .from('patient_medications')
    .select(PATIENT_MEDICATION_SELECT)
    .eq('patient_id', patientId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    return {
      data: [],
      errorMessage: extractErrorMessage(error, 'No fue posible consultar la medicación activa del paciente.'),
    };
  }

  return {
    data: ((data ?? []) as Array<PatientMedication & { medication_catalog?: MedicationCatalogItem | MedicationCatalogItem[] }>).map(
      normalizePatientMedication,
    ),
    errorMessage: null,
  };
}

export async function listVisitMedicationSnapshot(visitId: string): Promise<ServiceResult<PatientMedication[]>> {
  const visitResponse = await getVisitById(visitId);
  if (visitResponse.errorMessage || !visitResponse.data?.patient_id) {
    return {
      data: [],
      errorMessage: visitResponse.errorMessage ?? 'No se pudo resolver el paciente de la visita.',
    };
  }

  return listActivePatientMedications(visitResponse.data.patient_id);
}

export async function getLatestMedicationReviewDate(patientId: string): Promise<ServiceResult<string | null>> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede consultar la última revisión.' };
  }

  const { data, error } = await supabase
    .from('patient_medications')
    .select('updated_at')
    .eq('patient_id', patientId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      errorMessage: extractErrorMessage(error, 'No fue posible consultar la fecha de última revisión de medicación.'),
    };
  }

  return { data: data?.updated_at ?? null, errorMessage: null };
}

export async function saveVisitMedicationChanges(input: SaveVisitMedicationInput): Promise<ServiceResult<PatientMedication[]>> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se puede guardar la medicación.' };
  }

  const upserted: PatientMedication[] = [];

  for (const row of input.rows) {
    const payload = {
      patient_id: input.patientId,
      medication_catalog_id: row.medication_catalog_id,
      dose_text: trimOrNull(row.dose_text),
      frequency_text: trimOrNull(row.frequency_text),
      route_text: trimOrNull(row.route_text),
      indication: trimOrNull(row.indication),
      start_date: row.start_date || null,
      end_date: row.is_active ? null : new Date().toISOString().slice(0, 10),
      is_active: row.is_active,
      notes: trimOrNull(row.notes),
    };

    let persisted: PatientMedication | null = null;

    if (row.id) {
      const { data, error } = await supabase
        .from('patient_medications')
        .update(payload)
        .eq('id', row.id)
        .select(PATIENT_MEDICATION_SELECT)
        .maybeSingle();

      if (error) {
        return { data: [], errorMessage: extractErrorMessage(error, 'No fue posible actualizar una medicación del paciente.') };
      }
      persisted = data
        ? normalizePatientMedication(data as PatientMedication & { medication_catalog?: MedicationCatalogItem | MedicationCatalogItem[] })
        : null;
    } else {
      const { data, error } = await supabase
        .from('patient_medications')
        .insert(payload)
        .select(PATIENT_MEDICATION_SELECT)
        .maybeSingle();

      if (error) {
        return { data: [], errorMessage: extractErrorMessage(error, 'No fue posible añadir una nueva medicación.') };
      }
      persisted = data
        ? normalizePatientMedication(data as PatientMedication & { medication_catalog?: MedicationCatalogItem | MedicationCatalogItem[] })
        : null;
    }

    if (!persisted) {
      continue;
    }

    upserted.push(persisted);

    if (row.isInitialCompletion) {
      // The 'added' event was already logged when the record was first created
      // (immediate catalog-selection insert). Filling in the remaining fields
      // here is the same initial add, not a later modification — skip logging
      // a second event so change statistics aren't inflated.
      continue;
    }

    let eventType: MedicationEventType = 'confirmed_no_change';
    let oldValue: Record<string, unknown> | null = null;
    let newValue: Record<string, unknown> | null = null;

    const nextSnapshot = medicationSnapshot(payload);

    if (!row.previous) {
      eventType = 'added';
      newValue = nextSnapshot;
    } else if (row.previous.is_active && !row.is_active) {
      eventType = 'stopped';
      oldValue = medicationSnapshot({
        medication_catalog_id: row.previous.medication_catalog_id,
        dose_text: row.previous.dose_text,
        frequency_text: row.previous.frequency_text,
        route_text: row.previous.route_text,
        indication: row.previous.indication,
        start_date: row.previous.start_date,
        end_date: row.previous.end_date,
        is_active: row.previous.is_active,
        notes: row.previous.notes,
      });
      newValue = nextSnapshot;
    } else if (hasMedicationChanged(row.previous, nextSnapshot)) {
      eventType = 'modified';
      oldValue = medicationSnapshot({
        medication_catalog_id: row.previous.medication_catalog_id,
        dose_text: row.previous.dose_text,
        frequency_text: row.previous.frequency_text,
        route_text: row.previous.route_text,
        indication: row.previous.indication,
        start_date: row.previous.start_date,
        end_date: row.previous.end_date,
        is_active: row.previous.is_active,
        notes: row.previous.notes,
      });
      newValue = nextSnapshot;
    }

    const { error: eventError } = await supabase.from('visit_medication_events').insert({
      visit_id: input.visitId,
      patient_medication_id: persisted.id,
      event_type: eventType,
      old_value: oldValue,
      new_value: newValue,
    });

    if (eventError) {
      return { data: [], errorMessage: extractErrorMessage(eventError, 'No fue posible registrar el evento de medicación.') };
    }
  }

  const refreshed = await listActivePatientMedications(input.patientId);
  if (refreshed.errorMessage) {
    return { data: upserted, errorMessage: refreshed.errorMessage };
  }

  return { data: refreshed.data, errorMessage: null };
}

export async function listVisitMedicationEvents(visitId: string): Promise<ServiceResult<VisitMedicationEvent[]>> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se puede consultar la trazabilidad de medicación.' };
  }

  const { data, error } = await supabase
    .from('visit_medication_events')
    .select(
      'id,visit_id,patient_medication_id,event_type,old_value,new_value,created_at,patient_medication:patient_medication_id(id,medication_catalog:medication_catalog_id(display_name))',
    )
    .eq('visit_id', visitId)
    .order('created_at', { ascending: false });

  if (error) {
    return {
      data: [],
      errorMessage: extractErrorMessage(error, 'No fue posible consultar los cambios de medicación de la visita.'),
    };
  }

  return {
    data: ((data ?? []) as Array<
      VisitMedicationEvent & {
        patient_medication?:
          | { id: string; medication_catalog?: { display_name: string } | { display_name: string }[] }
          | Array<{ id: string; medication_catalog?: { display_name: string } | { display_name: string }[] }>;
      }
    >).map(normalizeVisitMedicationEvent),
    errorMessage: null,
  };
}
