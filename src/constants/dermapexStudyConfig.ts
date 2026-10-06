// Configuración del estudio DERMAPEX (FISEVI-CMODERMA-2026) para la estratificación CMO.
//
// Centraliza las DECISIONES POR DEFECTO D1-D8 del encargo de implementación. Todas están
// PENDIENTE VALIDACIÓN IP: se pueden cambiar aquí sin tocar la lógica del motor ni de las páginas
// (salvo donde se indica que la base de datos también lo exige; entonces hace falta migración).
// Documentación y trazabilidad: docs/DERMAPEX_CMO_ENGINE.md §4.

import type { CmoLevel } from '../services/cmoScoringEngine';

export type DecisionStatus = 'PENDIENTE VALIDACIÓN IP' | 'VALIDADA';

export const DERMAPEX_DECISIONS: Record<'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8', { title: string; status: DecisionStatus }> = {
  D1: { title: 'Datos ausentes: sí/no/desconocido; desconocido puntúa 0, marca incompleto y se permite guardar', status: 'PENDIENTE VALIDACIÓN IP' },
  D2: { title: 'Medicamento reciente: criterio y peso literales de la fuente (<1 año)', status: 'PENDIENTE VALIDACIÓN IP' },
  D3: { title: 'Requisitos especiales de conservación: variable informativa, 0 puntos, fuera del total', status: 'PENDIENTE VALIDACIÓN IP' },
  D4: { title: 'No se muestra la periodicidad de la fuente; se muestra el paquete mínimo del protocolo (anexo A)', status: 'PENDIENTE VALIDACIÓN IP' },
  D5: { title: 'Cohortes por centro (cmo/standard); el brazo estándar no ve resultados CMO', status: 'PENDIENTE VALIDACIÓN IP' },
  D6: { title: 'Estratificación en cualquier visita con motivo obligatorio', status: 'PENDIENTE VALIDACIÓN IP' },
  D7: { title: 'Catálogo de intervenciones literal de la fuente (borrador) + paquete del protocolo como guía', status: 'PENDIENTE VALIDACIÓN IP' },
  D8: { title: 'recommended_levels como fuente de verdad; min_level derivado (= nivel menos prioritario recomendado)', status: 'PENDIENTE VALIDACIÓN IP' },
};

// ── D1 · Datos ausentes ─────────────────────────────────────────────────────
export const UNKNOWN_ANSWER = 'unknown' as const;
/** D1: se permite guardar una estratificación con variables desconocidas (resultado marcado incompleto). */
export const ALLOW_SAVE_INCOMPLETE = true;
/** Las variables deben responderse explícitamente (sí/no/desconocido) antes de guardar: nada se da por «no». */
export const REQUIRE_EXPLICIT_ANSWER_FOR_EVERY_VARIABLE = true;

// ── D2 · Medicamento recientemente comercializado ──────────────────────────
// Se usa literalmente la variable de la fuente (medicamento_reciente: «comercializado hace menos de
// 1 año», 2 puntos). Discrepancia registrada (DISC-2): el protocolo dice «recientemente
// comercializado o con seguimiento adicional».
export const RECENT_MEDICATION_PROTOCOL_DISCREPANCY =
  'El protocolo DERMAPEX describe «medicamento recientemente comercializado o con seguimiento adicional»; se aplica el criterio literal de la fuente (comercializado hace menos de 1 año).';

// ── D4 · Paquetes mínimos del protocolo (tabla 5.4.4, anexo A del encargo) ──
// Textos literales del encargo. Se muestran en lugar de la periodicidad de la fuente (P1 semestral /
// P2 anual), que NO se muestra.
export const SHOW_SOURCE_FOLLOW_UP_PERIODICITY = false;

export const PROTOCOL_LEVEL_PACKAGES: Record<CmoLevel, { title: string; criterion: string; actions: string[] }> = {
  1: {
    title: 'Paquete mínimo · Nivel 1',
    criterion: '≥31 puntos o embarazo/deseo gestacional',
    actions: [
      'Seguimiento farmacéutico intensivo',
      'Entrevista motivacional estructurada',
      'Plan individualizado de objetivos farmacoterapéuticos',
      'Educación reforzada sobre enfermedad, administración, conservación y seguridad',
      'Revisión estrecha de adherencia',
      'Telefarmacia programada',
      'Registro de contactos no programados',
      'Coordinación activa ante incidencias',
    ],
  },
  2: {
    title: 'Paquete mínimo · Nivel 2',
    criterion: '18-30 puntos',
    actions: [
      'Seguimiento reforzado',
      'Revisión de adherencia y seguridad en cada visita relevante',
      'Resolución estructurada de dudas',
      'Refuerzo educativo',
      'Seguimiento mixto presencial/telemático',
      'Intervención específica si aparecen barreras o empeora la experiencia',
    ],
  },
  3: {
    title: 'Paquete mínimo · Nivel 3',
    criterion: '≤17 puntos',
    actions: [
      'Seguimiento estándar protocolizado',
      'Verificación de adherencia, seguridad y comprensión',
      'Educación básica',
      'Canal de contacto para dudas',
      'Reestratificación ante cambios clínicos o terapéuticos',
    ],
  },
};

export const PROTOCOL_PACKAGE_SOURCE = 'Protocolo DERMAPEX v0.5, tabla 5.4.4 (transcrita en el encargo de implementación, anexo A)';

// ── D5 · Cohortes por centro ────────────────────────────────────────────────
export type StudyArm = 'cmo' | 'standard';

export const STUDY_ARM_LABEL: Record<StudyArm, string> = {
  cmo: 'Atención farmacéutica CMO-MAPEX',
  standard: 'Atención farmacéutica estándar',
};

/**
 * D5: los usuarios de centros del brazo estándar NO ven nivel, puntuación, paquete ni catálogo CMO.
 * Solo coordinación ve los resultados. La base de datos lo impone por RLS y vistas enmascaradas
 * (migración 20261006100200): poner este flag a true NO basta para mostrarlos, hace falta migración.
 */
export const COMPARATOR_STRATIFICATION_VISIBLE = false;

export const COMPARATOR_SAVED_MESSAGE = 'Datos de estratificación registrados. Centro de atención farmacéutica estándar';

// ── D6 · Motivo de estratificación ─────────────────────────────────────────
// Los valores deben coincidir con el CHECK de cmo_scores.stratification_reason.
export const STRATIFICATION_REASONS = [
  { value: 'baseline', label: 'Basal' },
  { value: 'month_6', label: 'Visita 6 meses' },
  { value: 'month_12', label: 'Visita 12 meses' },
  { value: 'treatment_change', label: 'Cambio de tratamiento' },
  { value: 'clinical_change', label: 'Cambio clínico' },
  { value: 'need_detected', label: 'Necesidad detectada' },
] as const;

export type StratificationReason = (typeof STRATIFICATION_REASONS)[number]['value'];

export function getStratificationReasonLabel(value: string | null | undefined): string {
  return STRATIFICATION_REASONS.find((r) => r.value === value)?.label ?? (value ? value : '-');
}

// ── D7 · Catálogo de intervenciones ─────────────────────────────────────────
export const INTERVENTION_CATALOG_VERSION = 'cmoinmunomediadas@227e444-draft';
export const INTERVENTION_CATEGORY_LABEL: Record<string, string> = {
  seguimiento: 'Seguimiento farmacoterapéutico',
  educacion: 'Educación y formación',
  coordinacion: 'Coordinación asistencial',
};
export const INTERVENTION_TIER_LABEL: Record<string, string> = {
  basica: 'Básica',
  avanzada: 'Avanzada',
  centro: 'Dependiente del centro',
};

// ── D8 · Semántica de nivel ─────────────────────────────────────────────────
// Nivel 1 = mayor complejidad / máxima prioridad. Una tarjeta se recomienda para un nivel si ese nivel
// está en recommended_levels. intervention_catalog.min_level = max(recommended_levels) = nivel MENOS
// prioritario para el que se recomienda (derivado en BD; no se usa para filtrar).
