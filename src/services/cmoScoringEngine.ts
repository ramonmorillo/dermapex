export type CmoLevel = 1 | 2 | 3;

export type CmoVariableCode =
  | 'education_level'
  | 'age'
  | 'pregnancy_postpartum'
  | 'biological_sex'
  | 'race_ethnicity_risk'
  | 'hypertension_present'
  | 'non_hdl_mg_dl'
  | 'cv_pathology_present'
  | 'comorbidities_present'
  | 'recent_cvd_12m'
  | 'hospital_er_use_12m'
  | 'smoking_status'
  | 'physical_activity_pattern'
  | 'social_support_absent'
  | 'psychosocial_stress'
  | 'chronic_med_count'
  | 'high_risk_medication_present'
  | 'recent_regimen_change'
  | 'regimen_complexity_present'
  | 'adherence_problem';

export type EducationLevel = 'low' | 'medium' | 'high' | 'unknown' | null;
export type YesNoUnknown = 'yes' | 'no' | 'unknown' | null;
export type BiologicalSex = 'female' | 'male' | 'other' | 'unknown' | null;
export type RaceEthnicityRisk =
  | 'asian_non_chinese'
  | 'afro_caribbean'
  | 'afro_descendant_or_chinese'
  | 'other'
  | 'unknown'
  | null;
export type SmokingStatus = 'current' | 'former_recent' | 'never' | 'unknown' | null;
export type PhysicalActivityPattern = 'sedentary' | 'intense' | 'normal' | 'unknown' | null;

export interface CmoScoringInput {
  educationLevel?: EducationLevel;
  age?: number | null;
  pregnancyPostpartum?: YesNoUnknown;
  biologicalSex?: BiologicalSex;
  raceEthnicityRisk?: RaceEthnicityRisk;
  hypertensionPresent?: YesNoUnknown;
  nonHdlMgDl?: number | null;
  cvPathologyPresent?: YesNoUnknown;
  comorbiditiesPresent?: YesNoUnknown;
  recentCvd12m?: YesNoUnknown;
  hospitalErUse12m?: YesNoUnknown;
  smokingStatus?: SmokingStatus;
  physicalActivityPattern?: PhysicalActivityPattern;
  socialSupportAbsent?: YesNoUnknown;
  psychosocialStress?: YesNoUnknown;
  chronicMedCount?: number | null;
  highRiskMedicationPresent?: YesNoUnknown;
  recentRegimenChange?: YesNoUnknown;
  regimenComplexityPresent?: YesNoUnknown;
  adherenceProblem?: YesNoUnknown;
}

export interface CmoTriggeredVariable {
  code: CmoVariableCode;
  label: string;
  rawValue: number | string | null;
  points: number;
  rationale: string;
}

export interface CmoScoringResult {
  totalScore: number;
  level: CmoLevel;
  triggeredVariables: CmoTriggeredVariable[];
}

export const LEVEL_THRESHOLDS: ReadonlyArray<{ minScore: number; level: CmoLevel }> = [
  { minScore: 37, level: 1 },
  { minScore: 27, level: 2 },
  { minScore: 0, level: 3 },
];

function assignLevel(totalScore: number): CmoLevel {
  for (const { minScore, level } of LEVEL_THRESHOLDS) {
    if (totalScore >= minScore) return level;
  }
  return 3;
}

function addIfPositive(
  list: CmoTriggeredVariable[],
  item: Omit<CmoTriggeredVariable, 'points'> & { points: number },
) {
  if (item.points > 0) list.push(item);
}

export function scoreCmo(input: CmoScoringInput): CmoScoringResult {
  const triggeredVariables: CmoTriggeredVariable[] = [];

  // A) Demográficas
  addIfPositive(triggeredVariables, {
    code: 'education_level',
    label: 'Nivel educativo',
    rawValue: input.educationLevel ?? null,
    points: input.educationLevel === 'low' ? 4 : input.educationLevel === 'medium' ? 3 : 0,
    rationale: input.educationLevel === 'low'
      ? 'Nivel educativo bajo'
      : input.educationLevel === 'medium'
        ? 'Nivel educativo medio'
        : '',
  });

  const age = typeof input.age === 'number' ? input.age : null;
  addIfPositive(triggeredVariables, {
    code: 'age',
    label: 'Edad',
    rawValue: age,
    points: age !== null && age >= 70 ? 4 : age !== null && age >= 50 && age <= 69 ? 3 : 0,
    rationale: age !== null && age >= 70 ? 'Edad ≥ 70 años' : 'Edad entre 50 y 69 años',
  });

  addIfPositive(triggeredVariables, {
    code: 'pregnancy_postpartum',
    label: 'Embarazo / posparto',
    rawValue: input.pregnancyPostpartum ?? null,
    points: input.pregnancyPostpartum === 'yes' ? 4 : 0,
    rationale: 'Embarazo o posparto documentado',
  });

  addIfPositive(triggeredVariables, {
    code: 'biological_sex',
    label: 'Sexo biológico',
    rawValue: input.biologicalSex ?? null,
    points: input.biologicalSex === 'female' ? 2 : 0,
    rationale: 'Sexo biológico femenino',
  });

  addIfPositive(triggeredVariables, {
    code: 'race_ethnicity_risk',
    label: 'Raza/etnia de riesgo',
    rawValue: input.raceEthnicityRisk ?? null,
    points:
      input.raceEthnicityRisk === 'asian_non_chinese' ? 3
      : input.raceEthnicityRisk === 'afro_caribbean' ? 2
      : input.raceEthnicityRisk === 'afro_descendant_or_chinese' ? 2
      : 0,
    rationale:
      input.raceEthnicityRisk === 'asian_non_chinese'
        ? 'Raza/etnia: asiático no chino'
        : input.raceEthnicityRisk === 'afro_caribbean'
          ? 'Raza/etnia: afrocaribeño'
          : 'Raza/etnia: afrodescendiente o chino',
  });

  // B) Clínicas
  addIfPositive(triggeredVariables, {
    code: 'hypertension_present',
    label: 'HTA documentada',
    rawValue: input.hypertensionPresent ?? null,
    points: input.hypertensionPresent === 'yes' ? 4 : 0,
    rationale: 'HTA documentada (tratamiento antihipertensivo o umbrales clínicos)',
  });

  const nonHdl = typeof input.nonHdlMgDl === 'number' ? input.nonHdlMgDl : null;
  addIfPositive(triggeredVariables, {
    code: 'non_hdl_mg_dl',
    label: 'Colesterol no-HDL',
    rawValue: nonHdl,
    points: nonHdl !== null && nonHdl >= 130 ? 4 : 0,
    rationale: `No-HDL ≥ 130 mg/dL (${nonHdl ?? '-'})`,
  });

  addIfPositive(triggeredVariables, {
    code: 'cv_pathology_present',
    label: 'Patología cardiovascular',
    rawValue: input.cvPathologyPresent ?? null,
    points: input.cvPathologyPresent === 'yes' ? 4 : 0,
    rationale: 'Patología cardiovascular documentada',
  });

  addIfPositive(triggeredVariables, {
    code: 'comorbidities_present',
    label: 'Comorbilidades',
    rawValue: input.comorbiditiesPresent ?? null,
    points: input.comorbiditiesPresent === 'yes' ? 4 : 0,
    rationale: 'Comorbilidades relevantes presentes',
  });

  addIfPositive(triggeredVariables, {
    code: 'recent_cvd_12m',
    label: 'ECV reciente (12 meses)',
    rawValue: input.recentCvd12m ?? null,
    points: input.recentCvd12m === 'yes' ? 4 : 0,
    rationale: 'Evento cardiovascular en los últimos 12 meses',
  });

  addIfPositive(triggeredVariables, {
    code: 'hospital_er_use_12m',
    label: 'Uso hospital/urgencias (12 meses)',
    rawValue: input.hospitalErUse12m ?? null,
    points: input.hospitalErUse12m === 'yes' ? 4 : 0,
    rationale: 'Uso de hospital o urgencias en los últimos 12 meses',
  });

  // C) Sociales / sanitarias
  addIfPositive(triggeredVariables, {
    code: 'smoking_status',
    label: 'Tabaquismo',
    rawValue: input.smokingStatus ?? null,
    points: input.smokingStatus === 'current' ? 4 : input.smokingStatus === 'former_recent' ? 3 : 0,
    rationale: input.smokingStatus === 'current' ? 'Tabaquismo actual' : 'Exfumador reciente',
  });

  addIfPositive(triggeredVariables, {
    code: 'physical_activity_pattern',
    label: 'Patrón de actividad física',
    rawValue: input.physicalActivityPattern ?? null,
    points:
      input.physicalActivityPattern === 'sedentary' ? 4
      : input.physicalActivityPattern === 'intense' ? 3
      : 0,
    rationale:
      input.physicalActivityPattern === 'sedentary'
        ? 'Patrón de actividad física sedentario'
        : 'Actividad física intensa',
  });

  addIfPositive(triggeredVariables, {
    code: 'social_support_absent',
    label: 'Ausencia de apoyo social',
    rawValue: input.socialSupportAbsent ?? null,
    points: input.socialSupportAbsent === 'yes' ? 3 : 0,
    rationale: 'Ausencia de apoyo social',
  });

  addIfPositive(triggeredVariables, {
    code: 'psychosocial_stress',
    label: 'Estrés psicosocial',
    rawValue: input.psychosocialStress ?? null,
    points: input.psychosocialStress === 'yes' ? 3 : 0,
    rationale: 'Estrés psicosocial presente',
  });

  // D) Farmacoterapéuticas
  const chronicMedCount = typeof input.chronicMedCount === 'number' ? input.chronicMedCount : null;
  addIfPositive(triggeredVariables, {
    code: 'chronic_med_count',
    label: 'Número de medicamentos crónicos',
    rawValue: chronicMedCount,
    points:
      chronicMedCount !== null && chronicMedCount >= 10 ? 4
      : chronicMedCount !== null && chronicMedCount >= 5 ? 2
      : 0,
    rationale:
      chronicMedCount !== null && chronicMedCount >= 10
        ? `Polifarmacia ≥ 10 fármacos (${chronicMedCount})`
        : `Tratamiento crónico 5–9 fármacos (${chronicMedCount ?? '-'})`,
  });

  addIfPositive(triggeredVariables, {
    code: 'high_risk_medication_present',
    label: 'Medicación de alto riesgo',
    rawValue: input.highRiskMedicationPresent ?? null,
    points: input.highRiskMedicationPresent === 'yes' ? 1 : 0,
    rationale: 'Medicación de alto riesgo presente',
  });

  addIfPositive(triggeredVariables, {
    code: 'recent_regimen_change',
    label: 'Cambio reciente de pauta',
    rawValue: input.recentRegimenChange ?? null,
    points: input.recentRegimenChange === 'yes' ? 3 : 0,
    rationale: 'Cambio reciente de pauta terapéutica',
  });

  addIfPositive(triggeredVariables, {
    code: 'regimen_complexity_present',
    label: 'Complejidad de pauta',
    rawValue: input.regimenComplexityPresent ?? null,
    points: input.regimenComplexityPresent === 'yes' ? 3 : 0,
    rationale: 'Complejidad del régimen terapéutico',
  });

  addIfPositive(triggeredVariables, {
    code: 'adherence_problem',
    label: 'Problema de adherencia',
    rawValue: input.adherenceProblem ?? null,
    points: input.adherenceProblem === 'yes' ? 4 : 0,
    rationale: 'Problema de adherencia al tratamiento',
  });

  const totalScore = triggeredVariables.reduce((sum, current) => sum + current.points, 0);
  return {
    totalScore,
    level: assignLevel(totalScore),
    triggeredVariables,
  };
}
