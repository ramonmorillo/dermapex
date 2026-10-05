/**
 * CMO-DERMAPEX scoring engine — PENDIENTE DE IMPLEMENTACIÓN.
 *
 * El motor heredado de IRIS (CMO-RCV) se ha retirado deliberadamente en la fase de
 * migración arquitectónica: contenía variables y umbrales de riesgo cardiovascular
 * (HTA, colesterol no-HDL, ECV, puntos de corte 27/37) que NO son válidos para DERMAPEX.
 *
 * Reglas para la siguiente fase:
 *  - Las variables, puntuaciones y umbrales se implementarán exclusivamente a partir del
 *    protocolo oficial CMO-DERMAPEX (documento fuente versionado).
 *  - No reconvertir variables cardiovasculares en dermatológicas por sustitución simple.
 *  - Hasta entonces la aplicación NO calcula ni presenta niveles CMO.
 *
 * Se conservan aquí únicamente los TIPOS genéricos del resultado de estratificación
 * (nivel 1-3, puntuación total, variables activadas con trazabilidad), porque los
 * consumen la persistencia (cmoScoreService), los componentes de visualización y el
 * dashboard. Su validez para CMO-DERMAPEX debe confirmarse con el protocolo.
 */

export const CMO_ENGINE_NAME = 'CMO-DERMAPEX scoring engine';

export const CMO_ENGINE_STATUS: 'pending_protocol' = 'pending_protocol';

export function isCmoEngineAvailable(): boolean {
  return false;
}

export type CmoLevel = 1 | 2 | 3;

/** Código de variable del modelo. Se tipará con los códigos del protocolo CMO-DERMAPEX. */
export type CmoVariableCode = string;

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

/**
 * Umbrales de asignación de nivel. VACÍO a propósito: los umbrales CMO-RCV (≥37 → N1,
 * ≥27 → N2) no se conservan. Los componentes de visualización toleran una lista vacía.
 */
export const LEVEL_THRESHOLDS: ReadonlyArray<{ minScore: number; level: CmoLevel }> = [];
