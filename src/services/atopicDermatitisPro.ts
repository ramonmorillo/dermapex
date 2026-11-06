/**
 * Instrumentos específicos de dermatitis atópica: POEM y NRS de prurito (visita basal y mes 12).
 *
 * Fuente del texto: documentos aportados por el IP (2026-11-06), transcritos LITERALMENTE:
 *   · POEM: «POEM (Patient Oriented Eczema Measure)», adaptado de Charman CR, et al. Br J Dermatol.
 *     2013;169(6):1326-32 (bandas de gravedad incluidas en el mismo documento).
 *   · NRS: «En una escala del 0 al 10 en la que el 0 significa “Sin picor” y el 10 significa “peor picor
 *     imaginable” ¿Cómo puntuaría el peor picor que ha tenido durante las últimas 24 horas?», adaptado de
 *     Quan Phan N, et al. Acta Derm Venereol. 2012;92(5):502-7.
 *
 * Reglas (decisiones IP 2026-11-06):
 *   · POEM: 7 ítems 0-4, total 0-28 SOLO con los 7 ítems respondidos (regla estricta; la regla oficial
 *     de Nottingham —1 ausente = 0— NO se aplica: el nº de ausentes se exporta para poder aplicarla).
 *   · NRS: variante «peor picor en 24 h» (worst_itch_nrs_24h), sin atribuirle la licencia de PP-NRS.
 *     Sin umbrales de respuesta clínica.
 *   · Ausente ≠ 0: un ítem sin respuesta no tiene clave en `responses`; nunca se guarda como 0.
 *   · Las claves que empiezan por «_» son metadatos del registro (versión/variante), no ítems.
 * PENDIENTE: derechos de reproducción/uso de la versión española de POEM y de la NRS.
 */

// ── POEM ────────────────────────────────────────────────────────────────────

export const POEM_INSTRUMENT_VERSION = 'POEM-ES-IP-2026-11';
export const POEM_ITEM_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const;
export type PoemItemKey = (typeof POEM_ITEM_KEYS)[number];
export type PoemItemValue = 0 | 1 | 2 | 3 | 4;

/** Opciones literales del documento (también en el ítem 2, que pregunta por noches). */
export const POEM_OPTIONS: Array<{ value: PoemItemValue; label: string }> = [
  { value: 0, label: 'Ningún día' },
  { value: 1, label: '1-2 días' },
  { value: 2, label: '3-4 días' },
  { value: 3, label: '5-6 días' },
  { value: 4, label: 'Todos los días' },
];

export const POEM_ITEMS: Array<{ key: PoemItemKey; text: string }> = [
  { key: 'q1', text: 'En la última semana, ¿cuántos días usted/su hijo ha tenido picor a causa del eccema?' },
  { key: 'q2', text: 'En la última semana, ¿cuántas noches se ha alterado el sueño de usted/su hijo a causa del eccema?' },
  { key: 'q3', text: 'En la última semana, ¿cuántos días ha sangrado la piel de usted/su hijo a causa del eccema?' },
  { key: 'q4', text: 'En la última semana, ¿cuántos días el eccema de usted/su hijo está húmedo o moja la ropa?' },
  { key: 'q5', text: 'En la última semana, ¿cuántos días se ha agrietado la piel de usted/su hijo a causa del eccema?' },
  { key: 'q6', text: 'En la última semana, ¿cuántos días se ha descamado la piel de usted/su hijo a causa del eccema?' },
  { key: 'q7', text: 'En la última semana, ¿cuántos días ha estado seca o áspera la piel de usted/su hijo a causa del eccema?' },
];

export type PoemBand = 'limpio' | 'leve' | 'moderada' | 'grave' | 'muy_grave';

/** Bandas del documento aportado (Charman 2013). */
export const POEM_BAND_LABEL: Record<PoemBand, string> = {
  limpio: 'Limpio o casi limpio (0-2)',
  leve: 'Dermatitis atópica leve (3-7)',
  moderada: 'Dermatitis atópica moderada (8-16)',
  grave: 'Dermatitis atópica grave (17-24)',
  muy_grave: 'Dermatitis atópica muy grave (25-28)',
};

export function isPoemItemValue(value: unknown): value is PoemItemValue {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}

export function poemBand(total: number | null): PoemBand | null {
  if (total === null || !Number.isInteger(total) || total < 0 || total > 28) return null;
  if (total <= 2) return 'limpio';
  if (total <= 7) return 'leve';
  if (total <= 16) return 'moderada';
  if (total <= 24) return 'grave';
  return 'muy_grave';
}

export type PoemScore = {
  total: number | null;
  answeredItems: number;
  missingItems: number;
  /** Claves de ítem con valor fuera de 0-4 (no deberían existir: la BD las rechaza). */
  invalidItems: string[];
  band: PoemBand | null;
  complete: boolean;
};

export function scorePoem(responses: Record<string, unknown>): PoemScore {
  let sum = 0;
  let answeredItems = 0;
  const invalidItems: string[] = [];
  for (const key of POEM_ITEM_KEYS) {
    const value = responses[key];
    if (value === undefined || value === null || value === '') continue;
    if (!isPoemItemValue(value)) {
      invalidItems.push(key);
      continue;
    }
    answeredItems += 1;
    sum += value;
  }
  const complete = answeredItems === POEM_ITEM_KEYS.length;
  const total = complete ? sum : null;
  return {
    total,
    answeredItems,
    missingItems: POEM_ITEM_KEYS.length - answeredItems,
    invalidItems,
    band: poemBand(total),
    complete,
  };
}

/** Formulario → respuestas a guardar. Solo se incluyen los ítems contestados (ausente ≠ 0). */
export function buildPoemResponses(form: Partial<Record<PoemItemKey, PoemItemValue | null>>): Record<string, unknown> {
  const out: Record<string, unknown> = { _version: POEM_INSTRUMENT_VERSION };
  for (const key of POEM_ITEM_KEYS) {
    const value = form[key];
    if (isPoemItemValue(value)) out[key] = value;
  }
  return out;
}

// ── NRS de prurito ─────────────────────────────────────────────────────────

export const PRURITUS_NRS_VARIANT = 'worst_itch_nrs_24h' as const;
export const PRURITUS_NRS_RECALL_PERIOD = '24h' as const;
export const PRURITUS_NRS_VARIANT_LABEL: Record<string, string> = {
  [PRURITUS_NRS_VARIANT]: 'NRS de peor picor (últimas 24 h), adaptada de Phan 2012',
};
export const PRURITUS_NRS_QUESTION =
  'En una escala del 0 al 10 en la que el 0 significa “Sin picor” y el 10 significa “peor picor imaginable” ¿Cómo puntuaría el peor picor que ha tenido durante las últimas 24 horas?';
export const PRURITUS_NRS_ANCHORS = { 0: 'Sin picor', 10: 'Peor picor imaginable' } as const;
export const PRURITUS_NRS_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function isPruritusNrsValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10;
}

export type PruritusNrsScore = { score: number | null; variant: string | null; recallPeriod: string | null; invalid: boolean };

export function scorePruritusNrs(responses: Record<string, unknown>): PruritusNrsScore {
  const raw = responses.score;
  const present = raw !== undefined && raw !== null && raw !== '';
  const valid = isPruritusNrsValue(raw);
  return {
    score: valid ? raw : null,
    variant: typeof responses._variant === 'string' ? responses._variant : null,
    recallPeriod: typeof responses._recall_period === 'string' ? responses._recall_period : null,
    invalid: present && !valid,
  };
}

/** Puntuación (o null = ausente) → respuestas a guardar. Ausente: sin clave `score`, nunca 0. */
export function buildPruritusNrsResponses(score: number | null): Record<string, unknown> {
  const out: Record<string, unknown> = { _variant: PRURITUS_NRS_VARIANT, _recall_period: PRURITUS_NRS_RECALL_PERIOD };
  if (isPruritusNrsValue(score)) out.score = score;
  return out;
}

// ── Longitudinal ───────────────────────────────────────────────────────────

/**
 * Convención única de cambio en DERMAPEX: valor final (mes 12) − valor basal. Solo con dos mediciones
 * válidas y comparables (misma versión/variante cuando se indica); si no, null.
 */
export function longitudinalChange(
  baseline: number | null | undefined,
  final: number | null | undefined,
  comparable: { baseline?: string | null; final?: string | null } = {},
): number | null {
  if (typeof baseline !== 'number' || typeof final !== 'number' || !Number.isFinite(baseline) || !Number.isFinite(final)) return null;
  if ('baseline' in comparable || 'final' in comparable) {
    if (!comparable.baseline || !comparable.final || comparable.baseline !== comparable.final) return null;
  }
  return Number((final - baseline).toFixed(4));
}

/** ¿La clave de `responses` es un ítem (y no metadato del registro)? */
export function isResponseItemKey(key: string): boolean {
  return !key.startsWith('_');
}
