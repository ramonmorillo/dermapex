import { supabase } from '../lib/supabase';
import type {
  BiologicalSex,
  EducationLevel,
  PhysicalActivityPattern,
  RaceEthnicityRisk,
  SmokingStatus,
  YesNoUnknown,
} from './cmoScoringEngine';

type TriState = Exclude<YesNoUnknown, null>;

type AssessmentFieldType = 'uuid' | 'enum' | 'numeric' | 'integer' | 'boolean' | 'text';

type AssessmentFieldSchema = {
  type: AssessmentFieldType;
  values?: readonly string[];
};

export type ClinicalAssessment = {
  id: string;
  visit_id: string;
  education_level: EducationLevel;
  pregnancy_postpartum: TriState | null;
  biological_sex: BiologicalSex;
  race_ethnicity_risk: RaceEthnicityRisk;
  hypertension_present: TriState | null;
  cv_pathology_present: TriState | null;
  comorbidities_present: TriState | null;
  recent_cvd_12m: TriState | null;
  hospital_er_use_12m: TriState | null;
  physical_activity_pattern: PhysicalActivityPattern;
  social_support_absent: TriState | null;
  psychosocial_stress: TriState | null;
  chronic_med_count: number | null;
  recent_regimen_change: TriState | null;
  regimen_complexity_present: TriState | null;
  adherence_problem: TriState | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  heart_rate: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  waist_cm: number | null;
  ldl_mg_dl: number | null;
  hdl_mg_dl: number | null;
  non_hdl_mg_dl: number | null;
  fasting_glucose_mg_dl: number | null;
  hba1c_pct: number | null;
  score2_value: number | null;
  framingham_value: number | null;
  cv_risk_level: string | null;
  smoker_status: SmokingStatus;
  diet_score: number | null;
  safety_incidents: string | null;
  adverse_events_count: number | null;
  high_risk_medication_present: boolean | null;
  created_at?: string;
  updated_at?: string;
};

export type NewClinicalAssessmentInput = Omit<ClinicalAssessment, 'id' | 'created_at' | 'updated_at'>;

const ASSESSMENT_SELECT =
  'id,visit_id,education_level,pregnancy_postpartum,biological_sex,race_ethnicity_risk,hypertension_present,cv_pathology_present,comorbidities_present,recent_cvd_12m,hospital_er_use_12m,physical_activity_pattern,social_support_absent,psychosocial_stress,chronic_med_count,recent_regimen_change,regimen_complexity_present,adherence_problem,systolic_bp,diastolic_bp,heart_rate,weight_kg,height_cm,bmi,waist_cm,ldl_mg_dl,hdl_mg_dl,non_hdl_mg_dl,fasting_glucose_mg_dl,hba1c_pct,score2_value,framingham_value,cv_risk_level,smoker_status,diet_score,safety_incidents,adverse_events_count,high_risk_medication_present,created_at,updated_at';

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return 'Error desconocido al procesar evaluación clínica.';
}

const NULL_LIKE_VALUES = new Set(['', 'unknown', 'not_recorded', 'no registrado', 'desconocido']);

const CLINICAL_ASSESSMENT_SCHEMA: Record<keyof NewClinicalAssessmentInput, AssessmentFieldSchema> = {
  visit_id: { type: 'uuid' },
  education_level: { type: 'enum', values: ['low', 'medium', 'high', 'unknown'] },
  pregnancy_postpartum: { type: 'enum', values: ['yes', 'no', 'unknown'] },
  biological_sex: { type: 'enum', values: ['female', 'male', 'other', 'unknown'] },
  race_ethnicity_risk: {
    type: 'enum',
    values: ['asian_non_chinese', 'afro_caribbean', 'afro_descendant_or_chinese', 'other', 'unknown'],
  },
  hypertension_present: { type: 'enum', values: ['yes', 'no', 'unknown'] },
  cv_pathology_present: { type: 'enum', values: ['yes', 'no', 'unknown'] },
  comorbidities_present: { type: 'enum', values: ['yes', 'no', 'unknown'] },
  recent_cvd_12m: { type: 'enum', values: ['yes', 'no', 'unknown'] },
  hospital_er_use_12m: { type: 'enum', values: ['yes', 'no', 'unknown'] },
  physical_activity_pattern: { type: 'enum', values: ['sedentary', 'intense', 'normal', 'unknown'] },
  social_support_absent: { type: 'enum', values: ['yes', 'no', 'unknown'] },
  psychosocial_stress: { type: 'enum', values: ['yes', 'no', 'unknown'] },
  chronic_med_count: { type: 'integer' },
  recent_regimen_change: { type: 'enum', values: ['yes', 'no', 'unknown'] },
  regimen_complexity_present: { type: 'enum', values: ['yes', 'no', 'unknown'] },
  adherence_problem: { type: 'enum', values: ['yes', 'no', 'unknown'] },
  systolic_bp: { type: 'numeric' },
  diastolic_bp: { type: 'numeric' },
  heart_rate: { type: 'numeric' },
  weight_kg: { type: 'numeric' },
  height_cm: { type: 'numeric' },
  bmi: { type: 'numeric' },
  waist_cm: { type: 'numeric' },
  ldl_mg_dl: { type: 'numeric' },
  hdl_mg_dl: { type: 'numeric' },
  non_hdl_mg_dl: { type: 'numeric' },
  fasting_glucose_mg_dl: { type: 'numeric' },
  hba1c_pct: { type: 'numeric' },
  score2_value: { type: 'numeric' },
  framingham_value: { type: 'numeric' },
  cv_risk_level: { type: 'text' },
  smoker_status: { type: 'enum', values: ['never', 'former_recent', 'current', 'unknown'] },
  diet_score: { type: 'numeric' },
  safety_incidents: { type: 'text' },
  adverse_events_count: { type: 'integer' },
  high_risk_medication_present: { type: 'boolean' },
};

function normalizeNullLike(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;

  const normalized = value.trim();
  if (NULL_LIKE_VALUES.has(normalized.toLowerCase())) return null;

  return normalized;
}

function normalizeBoolean(value: unknown): boolean | null {
  const normalizedValue = normalizeNullLike(value);
  if (normalizedValue === null) return null;

  if (typeof normalizedValue === 'boolean') return normalizedValue;
  if (typeof normalizedValue === 'number') {
    if (normalizedValue === 1) return true;
    if (normalizedValue === 0) return false;
    return null;
  }
  if (typeof normalizedValue !== 'string') return null;

  const normalized = normalizedValue.toLowerCase();
  if (normalized === 'yes' || normalized === 'si' || normalized === 'sí' || normalized === 'true') return true;
  if (normalized === 'no' || normalized === 'false') return false;

  return null;
}

function normalizeNumber(value: unknown, integer = false): number | null {
  const normalizedValue = normalizeNullLike(value);
  if (normalizedValue === null) return null;

  if (typeof normalizedValue === 'number' && Number.isFinite(normalizedValue)) {
    return integer ? Math.trunc(normalizedValue) : normalizedValue;
  }

  if (typeof normalizedValue !== 'string') return null;

  const numericValue = Number(normalizedValue);
  if (!Number.isFinite(numericValue)) return null;

  return integer ? Math.trunc(numericValue) : numericValue;
}

function normalizeEnum(value: unknown, allowedValues: readonly string[]): string | null {
  const normalizedValue = normalizeNullLike(value);
  if (normalizedValue === null) return null;
  if (typeof normalizedValue !== 'string') return null;

  const lower = normalizedValue.toLowerCase();
  const mappedValue = lower === 'si' || lower === 'sí' || lower === 'true'
    ? 'yes'
    : lower === 'false'
      ? 'no'
      : lower;

  return allowedValues.includes(mappedValue) ? mappedValue : null;
}

export function normalizeAssessmentPayload(payload: Partial<NewClinicalAssessmentInput>): NewClinicalAssessmentInput {
  const normalizedPayload: Partial<Record<keyof NewClinicalAssessmentInput, unknown>> = {};

  for (const key of Object.keys(CLINICAL_ASSESSMENT_SCHEMA) as Array<keyof NewClinicalAssessmentInput>) {
    const schema = CLINICAL_ASSESSMENT_SCHEMA[key];
    const rawValue = payload[key];

    switch (schema.type) {
      case 'boolean':
        normalizedPayload[key] = normalizeBoolean(rawValue);
        break;
      case 'numeric':
        normalizedPayload[key] = normalizeNumber(rawValue);
        break;
      case 'integer':
        normalizedPayload[key] = normalizeNumber(rawValue, true);
        break;
      case 'enum':
        normalizedPayload[key] = normalizeEnum(rawValue, schema.values ?? []);
        break;
      case 'uuid':
      case 'text': {
        const normalizedValue = normalizeNullLike(rawValue);
        normalizedPayload[key] = typeof normalizedValue === 'string' ? normalizedValue : null;
        break;
      }
      default:
        normalizedPayload[key] = null;
    }
  }

  return normalizedPayload as NewClinicalAssessmentInput;
}

export async function upsertClinicalAssessment(input: NewClinicalAssessmentInput) {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede guardar la evaluación clínica.' };
  }

  const normalizedInput = normalizeAssessmentPayload(input);

  const { data, error } = await supabase
    .from('clinical_assessments')
    .upsert(normalizedInput, { onConflict: 'visit_id' })
    .select(ASSESSMENT_SELECT)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as ClinicalAssessment | null) ?? null, errorMessage: null };
}

export async function getClinicalAssessmentByVisit(visitId: string) {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede leer la evaluación clínica.' };
  }

  const { data, error } = await supabase
    .from('clinical_assessments')
    .select(ASSESSMENT_SELECT)
    .eq('visit_id', visitId)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as ClinicalAssessment | null) ?? null, errorMessage: null };
}

export async function getLatestClinicalAssessmentByPatient(patientId: string) {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede leer la última evaluación clínica.' };
  }

  const { data, error } = await supabase
    .from('clinical_assessments')
    .select(`${ASSESSMENT_SELECT},visits!inner(patient_id,visit_date)`)
    .eq('visits.patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return {
    data: (data as (ClinicalAssessment & { visits: { patient_id: string; visit_date: string | null } }) | null) ?? null,
    errorMessage: null,
  };
}

export type ClinicalAssessmentHistoryEntry = ClinicalAssessment & {
  visit_date: string | null;
  scheduled_date: string | null;
  visit_number: number | null;
};

/** Returns all clinical assessments for a patient, ordered oldest first, with visit date context. */
export async function listClinicalAssessmentsByPatient(patientId: string) {
  if (!supabase) {
    return { data: [] as ClinicalAssessmentHistoryEntry[], errorMessage: 'Supabase no está configurado. No se puede leer el historial de evaluaciones clínicas.' };
  }

  const { data, error } = await supabase
    .from('clinical_assessments')
    .select(`${ASSESSMENT_SELECT},visits!inner(patient_id,visit_date,scheduled_date,visit_number)`)
    .eq('visits.patient_id', patientId)
    .order('visit_date', { referencedTable: 'visits', ascending: true, nullsFirst: false })
    .order('scheduled_date', { referencedTable: 'visits', ascending: true, nullsFirst: false });

  if (error) {
    return { data: [] as ClinicalAssessmentHistoryEntry[], errorMessage: extractErrorMessage(error) };
  }

  const rows = ((data ?? []) as Array<ClinicalAssessment & {
    visits: { patient_id: string; visit_date: string | null; scheduled_date: string | null; visit_number: number | null } |
            Array<{ patient_id: string; visit_date: string | null; scheduled_date: string | null; visit_number: number | null }>;
  }>).map((r) => {
    const v = Array.isArray(r.visits) ? r.visits[0] : r.visits;
    return {
      ...r,
      visit_date: v?.visit_date ?? null,
      scheduled_date: v?.scheduled_date ?? null,
      visit_number: v?.visit_number ?? null,
    };
  });

  return { data: rows as ClinicalAssessmentHistoryEntry[], errorMessage: null };
}

export async function getLatestPreviousClinicalAssessmentByPatient(patientId: string, currentVisitId: string) {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede leer la última evaluación clínica previa.' };
  }

  const { data, error } = await supabase
    .from('clinical_assessments')
    .select(`${ASSESSMENT_SELECT},visits!inner(patient_id,visit_date,scheduled_date,created_at)`)
    .eq('visits.patient_id', patientId)
    .neq('visit_id', currentVisitId)
    .order('visit_date', { referencedTable: 'visits', ascending: false, nullsFirst: false })
    .order('scheduled_date', { referencedTable: 'visits', ascending: false, nullsFirst: false })
    .order('created_at', { referencedTable: 'visits', ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return {
    data: (data as (ClinicalAssessment & {
      visits: { patient_id: string; visit_date: string | null; scheduled_date: string | null; created_at: string | null };
    }) | null) ?? null,
    errorMessage: null,
  };
}
