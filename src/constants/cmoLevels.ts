// Presentación de los niveles de estratificación CMO-DERMAPEX. ÚNICA fuente de etiquetas de nivel
// (badge, panel de resultado, intervenciones, dashboard e informes).
// Solo contiene etiquetas y metadatos visuales: la asignación de nivel vive en cmoScoringEngine.
// Nivel 1 = Prioridad 1 = mayor complejidad. La escala visual es de intensidad (más tinta = más
// complejidad), nunca semafórica, para no sugerir que "3 es mejor".

export type CmoLevelValue = 1 | 2 | 3;

export const CMO_LEVEL_META: Record<CmoLevelValue, { label: string; shortLabel: string; complexity: string; criterion: string }> = {
  1: {
    label: 'Nivel 1 · Prioridad 1 (mayor complejidad)',
    shortLabel: 'N1 · P1',
    complexity: 'Mayor complejidad',
    criterion: '≥31 puntos o embarazo/deseo gestacional',
  },
  2: {
    label: 'Nivel 2 · Prioridad 2 (complejidad intermedia)',
    shortLabel: 'N2 · P2',
    complexity: 'Complejidad intermedia',
    criterion: '18-30 puntos',
  },
  3: {
    label: 'Nivel 3 · Prioridad 3 (menor complejidad)',
    shortLabel: 'N3 · P3',
    complexity: 'Menor complejidad',
    criterion: '≤17 puntos',
  },
};

export function toCmoLevel(value: unknown): CmoLevelValue | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return numeric === 1 || numeric === 2 || numeric === 3 ? numeric : null;
}

/** Etiqueta completa del nivel, o «No disponible». */
export function cmoLevelLabel(value: unknown): string {
  const level = toCmoLevel(value);
  return level ? CMO_LEVEL_META[level].label : 'No disponible';
}
