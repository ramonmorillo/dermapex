export const SEX_TYPE_OPTIONS = [
  { value: 'male', label: 'Varón' },
  { value: 'female', label: 'Mujer' },
  { value: 'other', label: 'Otro' },
  { value: 'unknown', label: 'Desconocido' },
] as const;

export type SexType = (typeof SEX_TYPE_OPTIONS)[number]['value'];

export const VISIT_TYPE_OPTIONS = [
  { value: 'baseline', label: 'Basal' },
  { value: 'month_3', label: 'Mes 3' },
  { value: 'month_6', label: 'Mes 6' },
  { value: 'month_9', label: 'Mes 9' },
  { value: 'month_12', label: 'Mes 12' },
  { value: 'extra', label: 'Extraordinaria' },
] as const;

export type VisitType = (typeof VISIT_TYPE_OPTIONS)[number]['value'];

const LEGACY_VISIT_TYPE_MAP: Record<string, VisitType> = {
  extraordinary: 'extra',
  follow_up: 'month_3',
  month3: 'month_3',
  month6: 'month_6',
  month9: 'month_9',
  month12: 'month_12',
};

export function normalizeVisitTypeValue(visitType: string | null): VisitType | string | null {
  if (!visitType) {
    return visitType;
  }

  return LEGACY_VISIT_TYPE_MAP[visitType] ?? visitType;
}

export function getVisitTypeLabel(visitType: VisitType | string | null): string {
  if (!visitType) {
    return '-';
  }

  const normalizedVisitType = normalizeVisitTypeValue(visitType);
  return VISIT_TYPE_OPTIONS.find((option) => option.value === normalizedVisitType)?.label ?? visitType;
}

const VISIT_NUMBER_BY_TYPE: Record<VisitType, number | null> = {
  baseline: 1,
  month_3: 2,
  month_6: 3,
  month_9: 4,
  month_12: 5,
  extra: null,
};

const VISIT_SORT_ORDER_BY_TYPE: Record<VisitType, number> = {
  baseline: 1,
  month_3: 2,
  month_6: 3,
  month_9: 4,
  month_12: 5,
  extra: 99,
};

export function getVisitNumberByType(visitType: VisitType | string | null): number | null {
  const normalizedVisitType = normalizeVisitTypeValue(visitType);

  if (!normalizedVisitType || !(normalizedVisitType in VISIT_NUMBER_BY_TYPE)) {
    return null;
  }

  return VISIT_NUMBER_BY_TYPE[normalizedVisitType as VisitType];
}

export function getVisitTypeSortOrder(visitType: VisitType | string | null): number {
  const normalizedVisitType = normalizeVisitTypeValue(visitType);

  if (!normalizedVisitType || !(normalizedVisitType in VISIT_SORT_ORDER_BY_TYPE)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return VISIT_SORT_ORDER_BY_TYPE[normalizedVisitType as VisitType];
}

// Valores del enum de BD (en inglés) con etiquetas de UI en español.
export const VISIT_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Programada' },
  { value: 'completed', label: 'Completada' },
  { value: 'cancelled', label: 'Cancelada' },
] as const;

export type VisitStatus = (typeof VISIT_STATUS_OPTIONS)[number]['value'];

export function getVisitStatusLabel(status: VisitStatus | null): string {
  if (!status) {
    return '-';
  }

  return VISIT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export const SMOKER_STATUS_OPTIONS = [
  { value: 'never', label: 'Nunca' },
  { value: 'former_recent', label: 'Exfumador reciente' },
  { value: 'current', label: 'Actual' },
  { value: 'unknown', label: 'Desconocido' },
] as const;

export type SmokerStatus = (typeof SMOKER_STATUS_OPTIONS)[number]['value'];

export function getSexLabel(sex: string | null | undefined): string {
  if (!sex) return '-';
  return SEX_TYPE_OPTIONS.find((option) => option.value === sex)?.label ?? sex;
}
