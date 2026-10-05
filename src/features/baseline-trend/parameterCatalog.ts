import type { ClinicalAssessment } from '../../services/assessmentService';

export type TrendParameterKey = Extract<
  keyof ClinicalAssessment,
  'systolic_bp' | 'diastolic_bp' | 'heart_rate' | 'weight_kg' | 'bmi' | 'waist_cm'
  | 'ldl_mg_dl' | 'hdl_mg_dl' | 'non_hdl_mg_dl' | 'fasting_glucose_mg_dl' | 'hba1c_pct'
  | 'score2_value' | 'framingham_value'
>;

export type TrendParameterGroup = 'vitals' | 'labs' | 'risk';

export type TrendParameterDef = {
  key: TrendParameterKey;
  label: string;
  unit: string;
  group: TrendParameterGroup;
};

export const TREND_PARAMETER_GROUP_LABELS: Record<TrendParameterGroup, string> = {
  vitals: 'Vitales y antropométricos',
  labs: 'Analíticos',
  risk: 'Riesgo cardiovascular calculado',
};

// Deliberately excludes parameters that share an axis poorly with the rest of
// their group (kept in separate groups) — never mixed on the same chart.
export const TREND_PARAMETERS: TrendParameterDef[] = [
  { key: 'systolic_bp', label: 'Presión arterial sistólica', unit: 'mmHg', group: 'vitals' },
  { key: 'diastolic_bp', label: 'Presión arterial diastólica', unit: 'mmHg', group: 'vitals' },
  { key: 'heart_rate', label: 'Frecuencia cardiaca', unit: 'lpm', group: 'vitals' },
  { key: 'weight_kg', label: 'Peso', unit: 'kg', group: 'vitals' },
  { key: 'bmi', label: 'Índice de masa corporal', unit: 'kg/m²', group: 'vitals' },
  { key: 'waist_cm', label: 'Perímetro de cintura', unit: 'cm', group: 'vitals' },
  { key: 'ldl_mg_dl', label: 'LDL', unit: 'mg/dl', group: 'labs' },
  { key: 'hdl_mg_dl', label: 'HDL', unit: 'mg/dl', group: 'labs' },
  { key: 'non_hdl_mg_dl', label: 'No-HDL', unit: 'mg/dl', group: 'labs' },
  { key: 'fasting_glucose_mg_dl', label: 'Glucosa en ayunas', unit: 'mg/dl', group: 'labs' },
  { key: 'hba1c_pct', label: 'HbA1c', unit: '%', group: 'labs' },
  { key: 'score2_value', label: 'SCORE2', unit: 'puntos', group: 'risk' },
  { key: 'framingham_value', label: 'Framingham', unit: 'puntos', group: 'risk' },
];
