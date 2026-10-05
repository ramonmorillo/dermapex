// Presentación de los niveles de estratificación CMO-RCV.
// Solo contiene etiquetas y metadatos visuales: la asignación de nivel vive en cmoScoringEngine.
// Nivel 1 = mayor complejidad/prioridad; Nivel 3 = menor complejidad. La escala visual es de
// intensidad (más tinta = más complejidad), nunca semafórica, para no sugerir que "3 es mejor".

export type CmoLevelValue = 1 | 2 | 3;

export const CMO_LEVEL_META: Record<CmoLevelValue, { label: string; shortLabel: string; complexity: string }> = {
  1: { label: 'Nivel 1 · Prioridad', shortLabel: 'N1 · Prioridad', complexity: 'Mayor complejidad' },
  2: { label: 'Nivel 2 · Intermedio', shortLabel: 'N2 · Intermedio', complexity: 'Complejidad intermedia' },
  3: { label: 'Nivel 3 · Basal', shortLabel: 'N3 · Basal', complexity: 'Menor complejidad' },
};

export function toCmoLevel(value: unknown): CmoLevelValue | null {
  const numeric = Number(value);
  return numeric === 1 || numeric === 2 || numeric === 3 ? numeric : null;
}
