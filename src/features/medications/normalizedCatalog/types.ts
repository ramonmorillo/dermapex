export type CatalogSource = 'cima' | 'internal' | 'manual';
export type MedicationSelectionSource = 'internal' | 'external_cima' | 'external_other' | 'manual';
export type MedCatalogProductSource = 'external_cima' | 'internal' | 'manual';
export type ConceptNormalizationStatus = 'exact' | 'inferred' | 'manual_review';
export type MedCatalogAliasType = 'cima_name' | 'generic' | 'brand' | 'manual' | 'typo';

export type MedCatalogIngredient = {
  id: string;
  source: CatalogSource;
  external_id: string | null;
  name_normalized: string;
  name_display: string;
  created_at: string;
  updated_at: string;
};

export type MedCatalogConcept = {
  id: string;
  canonical_name: string;
  fingerprint: string;
  strength_text: string | null;
  pharmaceutical_form: string | null;
  pharmaceutical_form_simplified: string | null;
  route_default: string | null;
  is_combination: boolean;
  atc_codes: string[];
  source_priority: CatalogSource | null;
  normalization_status: ConceptNormalizationStatus;
  created_at: string;
  updated_at: string;
};

export type MedCatalogConceptIngredient = {
  id: string;
  concept_id: string;
  ingredient_id: string;
  amount_text: string | null;
  unit: string | null;
  sort_order: number;
  created_at: string;
};

export type MedCatalogProduct = {
  id: string;
  concept_id: string;
  source: MedCatalogProductSource;
  cima_cn: string | null;
  cima_nregistro: string | null;
  cima_name: string | null;
  labtitular: string | null;
  commercialized: boolean | null;
  authorization_status: string | null;
  pharmaceutical_form: string | null;
  pharmaceutical_form_simplified: string | null;
  routes: string[] | null;
  atc_codes: string[];
  vmpp: string | null;
  vmp: string | null;
  raw_payload: Record<string, unknown> | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MedCatalogAlias = {
  id: string;
  concept_id: string;
  alias_text: string;
  alias_normalized: string;
  alias_type: MedCatalogAliasType;
  created_at: string;
};

export type BuildMedicationFingerprintInput = {
  ingredientNames: string[];
  strengthText?: string | null;
  pharmaceuticalForm?: string | null;
  routeDefault?: string | null;
};

export type ExternalMedicationPayload = Record<string, unknown>;

export type NormalizedMedicationCandidate = {
  productSource: MedCatalogProductSource;
  ingredientSource: CatalogSource;
  ingredientSourceExternalId: string | null;
  cimaCn: string | null;
  cimaNRegistro: string | null;
  cimaName: string;
  labtitular: string | null;
  canonicalName: string;
  ingredientNames: string[];
  strengthText: string | null;
  pharmaceuticalForm: string | null;
  pharmaceuticalFormSimplified: string | null;
  routeDefault: string | null;
  routes: string[];
  atcCodes: string[];
  vmpp: string | null;
  vmp: string | null;
  commercialized: boolean | null;
  authorizationStatus: string | null;
  aliasTexts: string[];
  aliasType: MedCatalogAliasType;
  sourcePriority: CatalogSource | null;
  normalizationStatus: ConceptNormalizationStatus;
  fingerprint: string;
  rawPayload: Record<string, unknown>;
  lastSyncedAt: string;
};

export type NormalizedMedicationUpsertResult = {
  conceptId: string;
  productId: string;
};
