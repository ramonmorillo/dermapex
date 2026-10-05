import { buildMedicationFingerprint, normalizeText } from './normalization';
import type {
  CatalogSource,
  ConceptNormalizationStatus,
  ExternalMedicationPayload,
  MedCatalogAliasType,
  MedCatalogProductSource,
  NormalizedMedicationCandidate,
} from './types';

function readString(payload: ExternalMedicationPayload, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readBoolean(payload: ExternalMedicationPayload, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return null;
}

function readCatalogSource(payload: ExternalMedicationPayload, keys: string[]): CatalogSource | null {
  const source = readString(payload, keys);
  if (!source) {
    return null;
  }

  const normalized = normalizeText(source);
  if (normalized.includes('cima')) return 'cima';
  if (normalized.includes('manual')) return 'manual';
  if (normalized.includes('internal')) return 'internal';
  return null;
}

function readConceptNormalizationStatus(
  payload: ExternalMedicationPayload,
  keys: string[],
): ConceptNormalizationStatus | null {
  const status = readString(payload, keys);
  if (!status) {
    return null;
  }

  const normalized = normalizeText(status);
  if (normalized === 'exact') return 'exact';
  if (normalized === 'inferred') return 'inferred';
  if (normalized === 'manual review' || normalized === 'manual_review') return 'manual_review';
  return null;
}

function readAliasType(payload: ExternalMedicationPayload, keys: string[]): MedCatalogAliasType | null {
  const aliasType = readString(payload, keys);
  if (!aliasType) {
    return null;
  }

  const normalized = normalizeText(aliasType);
  if (normalized === 'cima name' || normalized === 'cima_name') return 'cima_name';
  if (normalized === 'generic') return 'generic';
  if (normalized === 'brand') return 'brand';
  if (normalized === 'manual') return 'manual';
  if (normalized === 'typo') return 'typo';
  return null;
}

function readStringArray(payload: ExternalMedicationPayload, keys: string[]): string[] {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return value
        .split(/[,+;/|]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function dedupeNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(value.trim());
  }

  return output;
}

function inferProductSource(payload: ExternalMedicationPayload): MedCatalogProductSource {
  const source = readString(payload, ['source', 'provider', 'origin']);
  const normalized = normalizeText(source ?? '');

  if (normalized.includes('cima')) {
    return 'external_cima';
  }

  if (normalized.includes('manual')) {
    return 'manual';
  }

  return 'internal';
}

function simplifyPharmaceuticalForm(form: string | null): string | null {
  if (!form) {
    return null;
  }

  const normalized = normalizeText(form);
  if (normalized.includes('comprim')) return 'comprimido';
  if (normalized.includes('capsul')) return 'capsula';
  if (normalized.includes('inyect')) return 'inyectable';
  if (normalized.includes('solucion')) return 'solucion';

  return normalized || null;
}

export function mapExternalMedicationPayloadToNormalizedCandidate(
  payload: ExternalMedicationPayload,
): NormalizedMedicationCandidate {
  const cimaName =
    readString(payload, ['cima_name', 'nombre', 'name', 'display_name', 'medication_name', 'medicationName']) ??
    'medicamento sin nombre';

  const ingredientNames = dedupeNormalized(
    readStringArray(payload, ['ingredient_names', 'ingredients', 'principios_activos', 'active_ingredients', 'activeIngredient']),
  );

  const productSource = inferProductSource(payload);
  const cimaCn = readString(payload, ['cima_cn', 'cn', 'codigo_nacional', 'national_code']);
  const cimaNRegistro = readString(payload, ['cima_nregistro', 'nregistro', 'numero_registro']);
  const strengthText = readString(payload, ['strength_text', 'strength', 'dosis', 'dosage']);
  const pharmaceuticalForm = readString(payload, ['pharmaceutical_form', 'form', 'forma_farmaceutica']);
  const routeDefault = readString(payload, ['route_default', 'route', 'via', 'administration_route']);
  const atcCodes = dedupeNormalized(readStringArray(payload, ['atc_codes', 'atc_code', 'atc']));
  const routes = dedupeNormalized(readStringArray(payload, ['routes', 'route', 'vias', 'administration_route']));
  const canonicalName = readString(payload, ['canonical_name']) ?? cimaName;

  const fingerprint = buildMedicationFingerprint({
    ingredientNames,
    strengthText,
    pharmaceuticalForm,
    routeDefault,
  });

  return {
    productSource,
    ingredientSource: readCatalogSource(payload, ['ingredient_source', 'source']) ?? (productSource === 'external_cima' ? 'cima' : 'internal'),
    ingredientSourceExternalId: readString(payload, ['ingredient_external_id', 'source_ingredient_id']),
    cimaCn,
    cimaNRegistro,
    cimaName,
    labtitular: readString(payload, ['labtitular', 'laboratorio', 'holder']),
    canonicalName,
    ingredientNames,
    strengthText,
    pharmaceuticalForm,
    pharmaceuticalFormSimplified: simplifyPharmaceuticalForm(pharmaceuticalForm),
    routeDefault,
    routes: Array.isArray(routes) ? routes : [],
    atcCodes: Array.isArray(atcCodes) ? atcCodes : [],
    vmpp: readString(payload, ['vmpp']),
    vmp: readString(payload, ['vmp']),
    commercialized: readBoolean(payload, ['commercialized']),
    authorizationStatus: readString(payload, ['authorization_status', 'status']),
    aliasTexts: dedupeNormalized([
      cimaName,
      canonicalName,
      readString(payload, ['brand_name', 'nombre_comercial']) ?? '',
    ]),
    aliasType: readAliasType(payload, ['alias_type']) ?? 'cima_name',
    sourcePriority: readCatalogSource(payload, ['source_priority', 'concept_source_priority']) ?? 'cima',
    normalizationStatus: readConceptNormalizationStatus(payload, ['normalization_status']) ?? 'exact',
    fingerprint,
    rawPayload: payload,
    lastSyncedAt: new Date().toISOString(),
  };
}
