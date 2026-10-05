// Catálogo de parámetros longitudinales representables en la ficha del paciente.
//
// PENDIENTE DERMAPEX: el catálogo heredado de IRIS (PA, FC, IMC, cintura, LDL, HDL, no-HDL,
// glucosa, HbA1c, SCORE2, Framingham) se ha retirado por ser específico de riesgo cardiovascular.
// Se poblará con las variables clínicas cuantitativas que defina el protocolo DERMAPEX.
// La infraestructura de gráfico (BaselineTrendPanel) es genérica y se conserva.

export type TrendParameterKey = string;

/** Grupo de visualización. Las etiquetas se definirán con el protocolo. */
export type TrendParameterGroup = string;

export type TrendParameterDef = {
  key: TrendParameterKey;
  label: string;
  unit: string;
  group: TrendParameterGroup;
};

export const TREND_PARAMETER_GROUP_LABELS: Record<TrendParameterGroup, string> = {};

// Deliberately excludes parameters that share an axis poorly with the rest of
// their group (kept in separate groups) — never mixed on the same chart.
export const TREND_PARAMETERS: TrendParameterDef[] = [];

/** Fila longitudinal mínima: una visita con sus valores numéricos indexados por clave de parámetro. */
export type TrendEntry = {
  visit_id: string;
  visit_date: string | null;
  scheduled_date: string | null;
  visit_number: number | null;
  [parameterKey: string]: unknown;
};
