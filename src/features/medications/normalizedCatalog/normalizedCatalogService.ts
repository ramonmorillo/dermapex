import { supabase } from '../../../lib/supabase';
import { normalizeText } from './normalization';
import type {
  MedCatalogAlias,
  MedCatalogConcept,
  MedCatalogIngredient,
  MedCatalogProduct,
  NormalizedMedicationCandidate,
  NormalizedMedicationUpsertResult,
} from './types';

function asErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

type ServiceResult<T> = {
  data: T | null;
  errorMessage: string | null;
};

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

const INGREDIENT_SELECT = 'id,source,external_id,name_normalized,name_display,created_at,updated_at';
const CONCEPT_SELECT =
  'id,canonical_name,fingerprint,strength_text,pharmaceutical_form,pharmaceutical_form_simplified,route_default,is_combination,atc_codes,source_priority,normalization_status,created_at,updated_at';
const PRODUCT_SELECT =
  'id,concept_id,source,cima_cn,cima_nregistro,cima_name,labtitular,commercialized,authorization_status,pharmaceutical_form,pharmaceutical_form_simplified,routes,atc_codes,vmpp,vmp,raw_payload,last_synced_at,created_at,updated_at';

async function findIngredientByNormalizedName(nameNormalized: string): Promise<MedCatalogIngredient | null> {
  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from('med_catalog_ingredients')
    .select(INGREDIENT_SELECT)
    .eq('name_normalized', nameNormalized)
    .maybeSingle();

  return (data as MedCatalogIngredient | null) ?? null;
}

async function insertIngredient(candidate: NormalizedMedicationCandidate, nameDisplay: string): Promise<ServiceResult<MedCatalogIngredient>> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado.' };
  }

  const nameNormalized = normalizeText(nameDisplay);
  const existing = await findIngredientByNormalizedName(nameNormalized);
  if (existing) {
    return { data: existing, errorMessage: null };
  }

  const { data, error } = await supabase
    .from('med_catalog_ingredients')
    .insert({
      source: candidate.ingredientSource,
      external_id: candidate.ingredientSourceExternalId,
      name_normalized: nameNormalized,
      name_display: nameDisplay.trim(),
    })
    .select(INGREDIENT_SELECT)
    .maybeSingle();

  if (error) {
    // Relectura para tolerar concurrencia cuando otro cliente inserta el mismo ingrediente justo antes.
    const fallbackRead = await findIngredientByNormalizedName(nameNormalized);
    if (fallbackRead) {
      return { data: fallbackRead, errorMessage: null };
    }

    return {
      data: null,
      errorMessage: asErrorMessage(error, 'No fue posible crear ingrediente normalizado.'),
    };
  }

  return { data: (data as MedCatalogIngredient | null) ?? null, errorMessage: null };
}

async function findConceptByFingerprint(fingerprint: string): Promise<MedCatalogConcept | null> {
  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from('med_catalog_concepts')
    .select(CONCEPT_SELECT)
    .eq('fingerprint', fingerprint)
    .maybeSingle();

  return (data as MedCatalogConcept | null) ?? null;
}

async function ensureConcept(candidate: NormalizedMedicationCandidate): Promise<ServiceResult<MedCatalogConcept>> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado.' };
  }

  const existing = await findConceptByFingerprint(candidate.fingerprint);
  if (existing) {
    return { data: existing, errorMessage: null };
  }

  const { data, error } = await supabase
    .from('med_catalog_concepts')
    .insert({
      canonical_name: candidate.canonicalName,
      fingerprint: candidate.fingerprint,
      strength_text: candidate.strengthText,
      pharmaceutical_form: candidate.pharmaceuticalForm,
      pharmaceutical_form_simplified: candidate.pharmaceuticalFormSimplified,
      route_default: candidate.routeDefault,
      is_combination: candidate.ingredientNames.length > 1,
      atc_codes: ensureStringArray(candidate.atcCodes),
      source_priority: candidate.sourcePriority,
      normalization_status: candidate.normalizationStatus,
    })
    .select(CONCEPT_SELECT)
    .maybeSingle();

  if (error) {
    const fallbackRead = await findConceptByFingerprint(candidate.fingerprint);
    if (fallbackRead) {
      return { data: fallbackRead, errorMessage: null };
    }

    return {
      data: null,
      errorMessage: asErrorMessage(error, 'No fue posible crear concepto normalizado.'),
    };
  }

  return { data: (data as MedCatalogConcept | null) ?? null, errorMessage: null };
}

async function ensureConceptIngredientLinks(conceptId: string, ingredientIds: string[]): Promise<string | null> {
  if (!supabase || ingredientIds.length === 0) {
    return null;
  }

  for (const [index, ingredientId] of ingredientIds.entries()) {
    const sortOrder = index + 1;
    const { data: existing, error: readError } = await supabase
      .from('med_catalog_concept_ingredients')
      .select('id,amount_text,unit,sort_order')
      .eq('concept_id', conceptId)
      .eq('ingredient_id', ingredientId)
      .maybeSingle();

    if (readError) {
      return asErrorMessage(readError, 'No fue posible validar relación concepto-ingrediente.');
    }

    if (existing) {
      if (existing.amount_text !== null || existing.unit !== null || existing.sort_order !== sortOrder) {
        const { error: updateError } = await supabase
          .from('med_catalog_concept_ingredients')
          .update({
            amount_text: null,
            unit: null,
            sort_order: sortOrder,
          })
          .eq('id', existing.id);

        if (updateError) {
          return asErrorMessage(updateError, 'No fue posible actualizar relación concepto-ingrediente.');
        }
      }
      continue;
    }

    const { error: insertError } = await supabase.from('med_catalog_concept_ingredients').insert({
      concept_id: conceptId,
      ingredient_id: ingredientId,
      amount_text: null,
      unit: null,
      sort_order: sortOrder,
    });

    if (insertError) {
      return asErrorMessage(insertError, 'No fue posible crear relación concepto-ingrediente.');
    }
  }

  return null;
}

async function findProductByCimaCn(cimaCn: string): Promise<MedCatalogProduct | null> {
  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from('med_catalog_products')
    .select(PRODUCT_SELECT)
    .eq('cima_cn', cimaCn)
    .maybeSingle();

  return (data as MedCatalogProduct | null) ?? null;
}

async function insertProduct(
  conceptId: string,
  candidate: NormalizedMedicationCandidate,
): Promise<ServiceResult<MedCatalogProduct>> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado.' };
  }

  const safeRoutes = ensureStringArray(candidate.routes);
  const safeAtcCodes = ensureStringArray(candidate.atcCodes);

  const { data, error } = await supabase
    .from('med_catalog_products')
    .insert({
      concept_id: conceptId,
      source: candidate.productSource,
      cima_cn: candidate.cimaCn,
      cima_nregistro: candidate.cimaNRegistro,
      cima_name: candidate.cimaName,
      labtitular: candidate.labtitular,
      commercialized: candidate.commercialized,
      authorization_status: candidate.authorizationStatus,
      pharmaceutical_form: candidate.pharmaceuticalForm,
      pharmaceutical_form_simplified: candidate.pharmaceuticalFormSimplified,
      routes: safeRoutes,
      atc_codes: safeAtcCodes,
      vmpp: candidate.vmpp,
      vmp: candidate.vmp,
      raw_payload: candidate.rawPayload,
      last_synced_at: candidate.lastSyncedAt,
    })
    .select(PRODUCT_SELECT)
    .maybeSingle();

  if (error) {
    if (candidate.cimaCn) {
      const existing = await findProductByCimaCn(candidate.cimaCn);
      if (existing) {
        return { data: existing, errorMessage: null };
      }
    }

    return {
      data: null,
      errorMessage: asErrorMessage(error, 'No fue posible crear producto normalizado.'),
    };
  }

  return { data: (data as MedCatalogProduct | null) ?? null, errorMessage: null };
}

async function ensureAliases(
  conceptId: string,
  aliasTexts: string[],
  aliasType: MedCatalogAlias['alias_type'],
): Promise<string | null> {
  if (!supabase || aliasTexts.length === 0) {
    return null;
  }

  const deduped = Array.from(new Set(aliasTexts.map((aliasText) => aliasText.trim()).filter(Boolean)));
  if (deduped.length === 0) {
    return null;
  }

  const rows = deduped.map((aliasText): Omit<MedCatalogAlias, 'id' | 'created_at'> => ({
    concept_id: conceptId,
    alias_text: aliasText,
    alias_normalized: normalizeText(aliasText),
    alias_type: aliasType,
  }));

  for (const row of rows) {
    const { data: existing, error: readError } = await supabase
      .from('med_catalog_aliases')
      .select('id,alias_text,alias_type')
      .eq('concept_id', row.concept_id)
      .eq('alias_normalized', row.alias_normalized)
      .maybeSingle();

    if (readError) {
      return asErrorMessage(readError, 'No fue posible validar aliases normalizados.');
    }

    if (existing) {
      if (existing.alias_text !== row.alias_text || existing.alias_type !== row.alias_type) {
        const { error: updateError } = await supabase
          .from('med_catalog_aliases')
          .update({
            alias_text: row.alias_text,
            alias_type: row.alias_type,
          })
          .eq('id', existing.id);

        if (updateError) {
          return asErrorMessage(updateError, 'No fue posible actualizar aliases normalizados.');
        }
      }
      continue;
    }

    const { error: insertError } = await supabase.from('med_catalog_aliases').insert(row);
    if (insertError) {
      return asErrorMessage(insertError, 'No fue posible crear aliases normalizados.');
    }
  }

  return null;
}

export async function upsertNormalizedMedicationFromExternal(
  candidate: NormalizedMedicationCandidate,
): Promise<ServiceResult<NormalizedMedicationUpsertResult>> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede persistir medicación normalizada.',
    };
  }

  if (candidate.cimaCn) {
    const existingProduct = await findProductByCimaCn(candidate.cimaCn);
    if (existingProduct) {
      return {
        data: { conceptId: existingProduct.concept_id, productId: existingProduct.id },
        errorMessage: null,
      };
    }
  }

  const ingredientIds: string[] = [];
  for (const ingredientName of candidate.ingredientNames) {
    const ingredientResult = await insertIngredient(candidate, ingredientName);
    if (ingredientResult.errorMessage || !ingredientResult.data) {
      return {
        data: null,
        errorMessage: ingredientResult.errorMessage ?? 'No fue posible normalizar ingredientes.',
      };
    }
    ingredientIds.push(ingredientResult.data.id);
  }

  const conceptResult = await ensureConcept(candidate);
  if (conceptResult.errorMessage || !conceptResult.data) {
    return {
      data: null,
      errorMessage: conceptResult.errorMessage ?? 'No fue posible normalizar concepto.',
    };
  }

  const linksError = await ensureConceptIngredientLinks(conceptResult.data.id, ingredientIds);
  if (linksError) {
    return { data: null, errorMessage: linksError };
  }

  const productResult = await insertProduct(conceptResult.data.id, candidate);
  if (productResult.errorMessage || !productResult.data) {
    return {
      data: null,
      errorMessage: productResult.errorMessage ?? 'No fue posible normalizar producto.',
    };
  }

  const aliasError = await ensureAliases(conceptResult.data.id, candidate.aliasTexts, candidate.aliasType);
  if (aliasError) {
    return { data: null, errorMessage: aliasError };
  }

  return {
    data: {
      conceptId: conceptResult.data.id,
      productId: productResult.data.id,
    },
    errorMessage: null,
  };
}
