export type MedicationEventType = 'added' | 'modified' | 'stopped' | 'confirmed_no_change';

export type MedicationCatalogSource = 'internal' | 'manual' | 'external_cima' | 'external_other';

export type CatalogSource = 'cima' | 'internal' | 'manual';

export type MedicationCatalogItem = {
  id: string;
  source: MedicationCatalogSource;
  source_code: string | null;
  display_name: string;
  active_ingredient: string | null;
  strength: string | null;
  form: string | null;
  route: string | null;
  atc_code: string | null;
  created_at: string;
  updated_at: string;
};

export type MedicationOrigin =
  | { kind: 'internal'; source: 'internal' | 'manual' }
  | { kind: 'external'; source: 'external_cima' | 'external_other'; source_code: string | null };

export type MedicationSelectionSource = 'internal' | 'external_cima' | 'external_other' | 'manual';

export type PatientMedication = {
  id: string;
  patient_id: string;
  medication_catalog_id: string;
  catalog_concept_id?: string | null;
  catalog_product_id?: string | null;
  selection_source?: MedicationSelectionSource | null;
  selected_label_snapshot?: string | null;
  selected_source_payload?: Record<string, unknown> | null;
  dose_text: string | null;
  frequency_text: string | null;
  route_text: string | null;
  indication: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  medication_catalog?: MedicationCatalogItem;
};

export type VisitMedicationEvent = {
  id: string;
  visit_id: string;
  patient_medication_id: string;
  event_type: MedicationEventType;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
  patient_medication?: {
    id: string;
    medication_catalog?: {
      display_name: string;
    } | null;
  } | null;
};

export type PatientMedicationDraft = {
  id?: string;
  medication_catalog_id: string;
  dose_text: string;
  frequency_text: string;
  route_text: string;
  indication: string;
  start_date: string;
  notes: string;
  is_active: boolean;
  previous?: PatientMedication;
  /**
   * True when `previous` is the empty record created by the immediate
   * catalog-selection insert (importExternalMedicationToVisit), and the
   * clinician hasn't finished the initial add yet. First-time completion of
   * that record must count as 'added', not 'modified' — it's not
   * persisted, only used to route the very next save correctly.
   */
  isInitialCompletion?: boolean;
};
