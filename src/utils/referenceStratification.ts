export type StratificationEntry = {
  priority: number | string | null;
  visit_date: string | null;
  scheduled_date: string | null;
  created_at?: string | null;
};

/**
 * Latest CMO stratification of the patient on or before the given visit date.
 * Used as the patient's current level for interventions registered on visits
 * without their own score (e.g. extraordinary contacts). An undated visit
 * takes the latest stratification available. Returns null when none exists.
 */
export function pickReferenceStratification<T extends StratificationEntry>(
  history: T[],
  visitDate: string | null,
): T | null {
  const limit = visitDate ?? '9999-12-31';
  const candidates = history
    .filter((entry) => [1, 2, 3].includes(Number(entry.priority)))
    .filter((entry) => (entry.visit_date ?? entry.scheduled_date ?? '') <= limit)
    .sort((a, b) => {
      const byDate = (a.visit_date ?? a.scheduled_date ?? '').localeCompare(b.visit_date ?? b.scheduled_date ?? '');
      return byDate !== 0 ? byDate : (a.created_at ?? '').localeCompare(b.created_at ?? '');
    });
  return candidates[candidates.length - 1] ?? null;
}
