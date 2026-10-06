// Conjunto de investigación de estratificaciones CMO-DERMAPEX (una fila por estratificación).
// Función pura: recibe filas ya leídas (vistas enmascaradas) y devuelve filas + diccionario SPSS.
//
// Codificación de variables (diccionario):
//   · Variables Sí/No: 0 = No, 1 = Sí, 9 = Desconocido.
//   · comorbilidades_cv_diabetes: 0 = ninguna, 1 = una, 2 = más de una, 9 = desconocido.
//   · edad_grupo: 1 = ≤12, 2 = 13-17, 3 = 18-69, 4 = ≥70, 9 = desconocido (orden de AGE_GROUPS).
//   · Informativa (D3): inf_conservacion_especial 0/1/9; no forma parte de la puntuación.
// En un centro del brazo estándar (D5) las columnas de resultado llegan vacías desde la base de datos.

import { AGE_GROUP_CODE, CMO_AGE_GROUPS, CMO_ANSWER_FIELDS, CMO_BLOCKS, CMO_INFORMATIVE_FIELDS } from '../constants/cmoDermapexModel';
import { STRATIFICATION_REASONS } from '../constants/dermapexStudyConfig';
import type { StratificationItemValueRow, StratificationRegistryRow } from './cmoStratificationService';

export const UNKNOWN_CODE = 9;

export const REASON_CODES: Record<string, number> = Object.fromEntries(STRATIFICATION_REASONS.map((r, i) => [r.value, i + 1]));

export function variableColumn(code: string): string {
  return CMO_INFORMATIVE_FIELDS.some((f) => f.code === code) ? `inf_${code}` : `cmo_${code}`;
}

/** Valor bruto → código numérico del diccionario. */
export function encodeRawValue(code: string, raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw === 'unknown') return UNKNOWN_CODE;
  if (code === AGE_GROUP_CODE) {
    const index = CMO_AGE_GROUPS.findIndex((g) => g.value === raw);
    return index >= 0 ? index + 1 : null;
  }
  const field = CMO_ANSWER_FIELDS.find((f) => f.code === code);
  if (field?.valueType === 'select') {
    const index = field.options.findIndex((o) => o.value === raw);
    return index >= 0 ? index : null;
  }
  if (raw === 'si') return 1;
  if (raw === 'no') return 0;
  return null;
}

export type StratificationExportContext = {
  patientIdAnon: (rawPatientId: string) => string;
  visitIdAnon: (rawVisitId: string) => string;
  centerCode: (rawPatientId: string) => string;
  visitTypeLabel: (visitType: string | null) => string;
};

export function buildStratificationExportRows(
  registry: StratificationRegistryRow[],
  items: StratificationItemValueRow[],
  ctx: StratificationExportContext,
): Array<Record<string, string | number | null>> {
  const itemsByScore = new Map<string, StratificationItemValueRow[]>();
  for (const item of items) {
    const list = itemsByScore.get(item.cmo_score_id) ?? [];
    list.push(item);
    itemsByScore.set(item.cmo_score_id, list);
  }

  const sorted = [...registry].sort(
    (a, b) => ctx.patientIdAnon(a.patient_id).localeCompare(ctx.patientIdAnon(b.patient_id))
      || (a.visit_date ?? a.scheduled_date ?? '').localeCompare(b.visit_date ?? b.scheduled_date ?? '')
      || a.created_at.localeCompare(b.created_at),
  );

  return sorted.map((entry, index) => {
    const row: Record<string, string | number | null> = {
      stratification_id: `S${String(index + 1).padStart(5, '0')}`,
      patient_id: ctx.patientIdAnon(entry.patient_id),
      visit_id: ctx.visitIdAnon(entry.visit_id),
      center_code: ctx.centerCode(entry.patient_id),
      study_arm: entry.study_arm ?? '',
      visit_type: ctx.visitTypeLabel(entry.visit_type),
      visit_date: entry.visit_date ?? entry.scheduled_date ?? '',
      fecha_registro: entry.updated_at.slice(0, 10),
      motivo_estratificacion: entry.stratification_reason ? REASON_CODES[entry.stratification_reason] ?? null : null,
      score_total: entry.score,
    };
    for (const block of CMO_BLOCKS) {
      row[`score_${block.id}`] = entry.block_scores ? entry.block_scores.find((b) => b.block === block.id)?.points ?? 0 : null;
    }
    row.nivel_cmo = entry.priority;
    row.regla_especial = entry.special_rule_applied === null ? null : entry.special_rule_applied ? 1 : 0;
    row.incompleta = entry.incomplete === null ? null : entry.incomplete ? 1 : 0;
    row.n_desconocidas = entry.unknown_count;
    row.engine_version = entry.engine_version ?? '';
    row.model_version = entry.model_version ?? '';

    const values = new Map((itemsByScore.get(entry.id) ?? []).map((item) => [item.variable_code, item.raw_value?.value ?? null]));
    for (const code of [AGE_GROUP_CODE, ...CMO_ANSWER_FIELDS.map((f) => f.code), ...CMO_INFORMATIVE_FIELDS.map((f) => f.code)]) {
      row[variableColumn(code)] = encodeRawValue(code, values.get(code));
    }
    return row;
  });
}

const YES_NO_LABELS = { '0': 'No', '1': 'Si', '9': 'Desconocido' };

/** Etiquetas SPSS en español (sin tildes por compatibilidad con versiones antiguas de SPSS). */
export function stratificationSpssDictionary(): { variableLabels: Record<string, string>; valueLabels: Record<string, Record<string, string>> } {
  const variableLabels: Record<string, string> = {
    stratification_id: 'Identificador anonimizado de la estratificacion',
    patient_id: 'Identificador anonimizado del paciente',
    visit_id: 'Identificador anonimizado de la visita',
    center_code: 'Codigo de centro participante',
    study_arm: 'Cohorte del centro (cmo = AF CMO-MAPEX; standard = AF estandar)',
    visit_type: 'Tipo de visita',
    visit_date: 'Fecha de la visita',
    fecha_registro: 'Fecha del ultimo registro de la estratificacion',
    motivo_estratificacion: 'Motivo de la estratificacion',
    score_total: 'Puntuacion CMO total',
    nivel_cmo: 'Nivel CMO (1 = mayor complejidad)',
    regla_especial: 'Regla especial de embarazo o deseo gestacional aplicada',
    incompleta: 'Estratificacion con variables desconocidas',
    n_desconocidas: 'Numero de variables puntuables desconocidas',
    engine_version: 'Version del motor de estratificacion',
    model_version: 'Version del modelo CMO',
  };
  for (const block of CMO_BLOCKS) variableLabels[`score_${block.id}`] = `Puntuacion CMO bloque ${block.id}`;

  const valueLabels: Record<string, Record<string, string>> = {
    motivo_estratificacion: Object.fromEntries(STRATIFICATION_REASONS.map((r, i) => [String(i + 1), r.label])),
    nivel_cmo: { '1': 'Nivel 1 Prioridad 1 (mayor complejidad)', '2': 'Nivel 2 Prioridad 2', '3': 'Nivel 3 Prioridad 3 (menor complejidad)' },
    regla_especial: { '0': 'No', '1': 'Si' },
    incompleta: { '0': 'No', '1': 'Si' },
  };

  variableLabels[variableColumn(AGE_GROUP_CODE)] = 'Grupo de edad (derivado de la edad de inclusion)';
  valueLabels[variableColumn(AGE_GROUP_CODE)] = {
    ...Object.fromEntries(CMO_AGE_GROUPS.map((g, i) => [String(i + 1), g.label])),
    '9': 'Desconocido',
  };
  for (const field of CMO_ANSWER_FIELDS) {
    variableLabels[variableColumn(field.code)] = field.label;
    valueLabels[variableColumn(field.code)] = field.valueType === 'select'
      ? { ...Object.fromEntries(field.options.map((o, i) => [String(i), o.label])), '9': 'Desconocido' }
      : YES_NO_LABELS;
  }
  for (const field of CMO_INFORMATIVE_FIELDS) {
    variableLabels[variableColumn(field.code)] = `${field.label} (informativa, no puntua)`;
    valueLabels[variableColumn(field.code)] = YES_NO_LABELS;
  }
  return { variableLabels, valueLabels };
}
