/**
 * CMO-DERMAPEX scoring engine.
 *
 * Port TypeScript PURO (sin red, DOM ni almacenamiento) de assets/modules/cmo-engine.js
 * (computeStratification) de ramonmorillo/cmoinmunomediadas @ 227e444, subtipo dermatológico.
 * Los datos del modelo (variables, pesos, bandas de edad, umbrales) viven en
 * src/constants/cmoDermapexModel.ts; aquí solo está la regla de cálculo.
 *
 * Equivalencia con la fuente verificada en tests/cmoEngineEquivalence.test.ts (casos dirigidos +
 * 500 combinaciones aleatorias con semilla fija). Diferencias deliberadas, documentadas en
 * docs/DERMAPEX_CMO_ENGINE.md:
 *  - D1 (PENDIENTE VALIDACIÓN IP): cada variable es sí/no/desconocido. «Desconocido» puntúa 0 (como
 *    una variable no confirmada en la fuente) y además marca el resultado como incompleto.
 *  - Edad ausente o fuera de bandas → «desconocido» (0 puntos). La fuente, con edad vacía (''),
 *    asigna la banda ≤12 (1 punto) porque Number('') = 0 (DISC-3); en DERMAPEX la edad procede de
 *    patients.age_at_inclusion (18-120), así que en la práctica solo afecta a pacientes sin edad.
 *  - D3: variable informativa registrada fuera del total.
 */

import {
  AGE_GROUP_CODE,
  AGE_GROUP_LABEL,
  CMO_AGE_GROUPS,
  CMO_ANSWER_FIELDS,
  CMO_BLOCKS,
  CMO_INFORMATIVE_FIELDS,
  CMO_LEVEL_THRESHOLDS_SOURCE,
  CMO_MODEL_VERSION,
  CMO_SOURCE,
  type CmoBlockId,
} from '../constants/cmoDermapexModel';

export const CMO_ENGINE_NAME = 'CMO-DERMAPEX scoring engine';

/** Versión del motor (código de cálculo). Se guarda en cmo_scores.engine_version. */
export const CMO_ENGINE_VERSION = `cmo-dermapex-1.0.0+src.${CMO_SOURCE.commitShort}`;

export { CMO_MODEL_VERSION };

export const CMO_ENGINE_STATUS: 'implemented_pending_ip_validation' = 'implemented_pending_ip_validation';

export function isCmoEngineAvailable(): boolean {
  return true;
}

export type CmoLevel = 1 | 2 | 3;

export type CmoVariableCode = string;

export const UNKNOWN = 'unknown' as const;

/** Respuesta a una variable: valor de la fuente ('si'/'no', 'ninguna'/'una'/'mas-una') o 'unknown'. */
export type CmoAnswer = string;

export type CmoInput = {
  /** Edad en años (patients.age_at_inclusion). null = desconocida. */
  age: number | null;
  /** Respuestas por código de variable de la fuente. Una clave ausente equivale a 'unknown' (D1). */
  answers: Partial<Record<CmoVariableCode, CmoAnswer>>;
  /** Variables informativas (D3), por código. Ausente = 'unknown'. */
  informative?: Partial<Record<CmoVariableCode, CmoAnswer>>;
};

export interface CmoTriggeredVariable {
  code: CmoVariableCode;
  label: string;
  rawValue: number | string | null;
  points: number;
  rationale: string;
}

export interface CmoItemResult {
  code: CmoVariableCode;
  label: string;
  block: CmoBlockId | 'informativa';
  /** Valor registrado: opción de la fuente, banda de edad o 'unknown'. */
  rawValue: string;
  /** Edad en años (solo para edad_grupo). */
  age?: number | null;
  points: number;
  scored: boolean;
}

export interface CmoBlockScore {
  block: CmoBlockId;
  label: string;
  points: number;
  declaredMaxPoints: number;
}

export interface CmoScoringResult {
  totalScore: number;
  blockScores: CmoBlockScore[];
  level: CmoLevel;
  /** Regla especial de embarazo / deseo gestacional aplicada (fuerza nivel 1). */
  specialRuleApplied: boolean;
  /** Variables puntuables con puntos > 0, ordenadas por puntos desc. (como contributingFactors). */
  triggeredVariables: CmoTriggeredVariable[];
  /** Variables informativas (D3) con su valor; nunca suman. */
  informative: Array<{ code: string; label: string; rawValue: string }>;
  /** Códigos de variables puntuables con valor desconocido. */
  unknown: CmoVariableCode[];
  incomplete: boolean;
  /** Una fila por variable puntuable + informativas (para cmo_score_item_results). */
  items: CmoItemResult[];
  engineVersion: string;
  modelVersion: string;
}

/** Umbrales de nivel (fuente: PRIORITY_THRESHOLDS). Nivel 3 por debajo del menor. */
export const LEVEL_THRESHOLDS: ReadonlyArray<{ minScore: number; level: CmoLevel }> = [
  { minScore: CMO_LEVEL_THRESHOLDS_SOURCE.level1, level: 1 },
  { minScore: CMO_LEVEL_THRESHOLDS_SOURCE.level2, level: 2 },
];

export const PREGNANCY_RULE_CODES: ReadonlyArray<string> = CMO_ANSWER_FIELDS.filter((f) => f.specialRule === 'pregnancy_trigger').map((f) => f.code);

export const CMO_DECLARED_MAX_SCORE = CMO_BLOCKS.reduce((sum, b) => sum + b.declaredMaxPoints, 0);

export class CmoInputError extends Error {}

export function ageToGroup(age: number | null | undefined) {
  if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) return null;
  return CMO_AGE_GROUPS.find((g) => age >= g.min && age <= g.max) ?? null;
}

export function levelForScore(totalScore: number, specialRuleApplied: boolean): CmoLevel {
  let level: CmoLevel = 3;
  if (totalScore >= CMO_LEVEL_THRESHOLDS_SOURCE.level2) level = 2;
  if (totalScore >= CMO_LEVEL_THRESHOLDS_SOURCE.level1) level = 1;
  if (specialRuleApplied) level = 1;
  return level;
}

function optionLabel(code: string, value: string): string {
  const field = CMO_ANSWER_FIELDS.find((f) => f.code === code);
  return field?.options.find((o) => o.value === value)?.label ?? value;
}

/** Valida que cada respuesta sea una opción de la fuente o 'unknown'. Lanza CmoInputError si no. */
export function validateCmoInput(input: CmoInput): void {
  const knownCodes = new Set(CMO_ANSWER_FIELDS.map((f) => f.code));
  for (const [code, value] of Object.entries(input.answers)) {
    if (!knownCodes.has(code)) throw new CmoInputError(`Variable desconocida en el modelo: ${code}`);
    const field = CMO_ANSWER_FIELDS.find((f) => f.code === code);
    if (value !== undefined && value !== UNKNOWN && !field?.options.some((o) => o.value === value)) {
      throw new CmoInputError(`Valor no válido para ${code}: ${String(value)}`);
    }
  }
  for (const [code, value] of Object.entries(input.informative ?? {})) {
    const field = CMO_INFORMATIVE_FIELDS.find((f) => f.code === code);
    if (!field) throw new CmoInputError(`Variable informativa desconocida: ${code}`);
    if (value !== undefined && value !== UNKNOWN && !field.options.some((o) => o.value === value)) {
      throw new CmoInputError(`Valor no válido para ${code}: ${String(value)}`);
    }
  }
  if (input.age !== null && (typeof input.age !== 'number' || !Number.isFinite(input.age))) {
    throw new CmoInputError('La edad debe ser un número o null.');
  }
}

export function scoreCmo(input: CmoInput): CmoScoringResult {
  validateCmoInput(input);

  const blockPoints = new Map<CmoBlockId, number>(CMO_BLOCKS.map((b) => [b.id, 0]));
  const triggered: CmoTriggeredVariable[] = [];
  const unknown: string[] = [];
  const items: CmoItemResult[] = [];
  let total = 0;

  // Edad → banda (derivada; no es una respuesta del farmacéutico).
  const ageGroup = ageToGroup(input.age);
  if (ageGroup) {
    total += ageGroup.points;
    blockPoints.set('demografica', (blockPoints.get('demografica') ?? 0) + ageGroup.points);
    if (ageGroup.points > 0) {
      triggered.push({
        code: AGE_GROUP_CODE,
        label: AGE_GROUP_LABEL,
        rawValue: input.age,
        points: ageGroup.points,
        rationale: `${input.age} años → ${ageGroup.label} → ${ageGroup.points} punto(s)`,
      });
    }
  } else {
    unknown.push(AGE_GROUP_CODE);
  }
  items.push({
    code: AGE_GROUP_CODE,
    label: AGE_GROUP_LABEL,
    block: 'demografica',
    rawValue: ageGroup ? ageGroup.value : UNKNOWN,
    age: input.age,
    points: ageGroup ? ageGroup.points : 0,
    scored: true,
  });

  for (const field of CMO_ANSWER_FIELDS) {
    const value = input.answers[field.code] ?? UNKNOWN;
    if (value === UNKNOWN) {
      unknown.push(field.code);
      items.push({ code: field.code, label: field.label, block: field.block, rawValue: UNKNOWN, points: 0, scored: true });
      continue;
    }
    const option = field.options.find((o) => o.value === value);
    const points = option && option.points > 0 ? option.points : 0;
    items.push({ code: field.code, label: field.label, block: field.block, rawValue: value, points, scored: true });
    if (points > 0) {
      total += points;
      blockPoints.set(field.block, (blockPoints.get(field.block) ?? 0) + points);
      triggered.push({
        code: field.code,
        label: field.label,
        rawValue: value,
        points,
        rationale: `${option?.label ?? value} → ${points} punto(s) (${CMO_BLOCKS.find((b) => b.id === field.block)?.label ?? field.block})`,
      });
    }
  }

  // Orden estable por puntos desc. (la fuente ordena contributingFactors igual).
  triggered.sort((a, b) => b.points - a.points);

  const specialRuleApplied = PREGNANCY_RULE_CODES.some((code) => input.answers[code] === 'si');

  const informative = CMO_INFORMATIVE_FIELDS.map((field) => {
    const value = input.informative?.[field.code] ?? UNKNOWN;
    items.push({ code: field.code, label: field.label, block: 'informativa', rawValue: value, points: 0, scored: false });
    return { code: field.code, label: field.label, rawValue: value };
  });

  return {
    totalScore: total,
    blockScores: CMO_BLOCKS.map((b) => ({ block: b.id, label: b.label, points: blockPoints.get(b.id) ?? 0, declaredMaxPoints: b.declaredMaxPoints })),
    level: levelForScore(total, specialRuleApplied),
    specialRuleApplied,
    triggeredVariables: triggered,
    informative,
    unknown,
    incomplete: unknown.length > 0,
    items,
    engineVersion: CMO_ENGINE_VERSION,
    modelVersion: CMO_MODEL_VERSION,
  };
}

/** Etiqueta legible de un valor registrado (para UI e informes). */
export function describeAnswer(code: string, rawValue: string): string {
  if (rawValue === UNKNOWN) return 'Desconocido';
  if (code === AGE_GROUP_CODE) return CMO_AGE_GROUPS.find((g) => g.value === rawValue)?.label ?? rawValue;
  const informative = CMO_INFORMATIVE_FIELDS.find((f) => f.code === code);
  if (informative) return informative.options.find((o) => o.value === rawValue)?.label ?? rawValue;
  return optionLabel(code, rawValue);
}
