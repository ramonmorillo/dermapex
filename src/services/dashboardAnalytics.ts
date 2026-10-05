export type DashboardScore = {
  score: number | string | null;
  priority: number | string | null;
};

export type DashboardVisit = {
  id: string;
  patient_id: string;
  visit_type: string | null;
  visit_date: string | null;
  scheduled_date?: string | null;
  visit_status?: string | null;
  created_at?: string | null;
  cmo_scores?: DashboardScore | DashboardScore[] | null;
};

export type LongitudinalDashboardMetrics = {
  baselinePriorityByPatient: Map<string, 1 | 2 | 3>;
  latestPriorityByPatient: Map<string, 1 | 2 | 3>;
  improved: number;
  worsened: number;
  stable: number;
  averageBaselineScore: number;
  averageLatestScore: number;
  patientsWithoutFollowup90d: number;
};

const INVALID_CLINICAL_STATUSES = new Set(['cancelled', 'cancelada', 'no_show', 'no_presentada']);

function firstScore(visit: DashboardVisit): DashboardScore | null {
  if (Array.isArray(visit.cmo_scores)) return visit.cmo_scores[0] ?? null;
  return visit.cmo_scores ?? null;
}

function isBaselineVisit(visit: DashboardVisit): boolean {
  return visit.visit_type === 'baseline' || visit.visit_type === 'basal';
}

/**
 * A visit counts clinically when it has an attended date or a recorded CMO
 * stratification (a scored visit was performed even if its date/status was
 * not updated). Cancelled / no-show visits never count.
 */
function isValidClinicalVisit(visit: DashboardVisit): boolean {
  if (INVALID_CLINICAL_STATUSES.has(visit.visit_status ?? '')) return false;
  return Boolean(visit.visit_date) || priority(firstScore(visit)?.priority) !== null;
}

/** Ordering date: attended date, else scheduled date; undated baseline anchors first, other undated visits last. */
function clinicalSortDate(visit: DashboardVisit): string {
  return visit.visit_date ?? visit.scheduled_date ?? (isBaselineVisit(visit) ? '' : '9999-12-31');
}

function compareClinicalVisits(a: DashboardVisit, b: DashboardVisit): number {
  const byDate = clinicalSortDate(a).localeCompare(clinicalSortDate(b));
  if (byDate !== 0) return byDate;
  const byCreation = (a.created_at ?? '').localeCompare(b.created_at ?? '');
  if (byCreation !== 0) return byCreation;
  return a.id.localeCompare(b.id);
}

function numericScore(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priority(value: number | string | null | undefined): 1 | 2 | 3 | null {
  const parsed = Number(value);
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : null;
}

function roundedAverage(values: number[]): number {
  return values.length === 0
    ? 0
    : Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2));
}

/**
 * Computes patient-level longitudinal metrics from clinical visit dates.
 * Missing scores are excluded rather than converted to zero. A latest visit
 * without a score does not fall back to an older visit's score for the
 * average latest score, but the current CMO level is the latest stratification.
 */
export function calculateLongitudinalDashboardMetrics(
  patientIds: string[],
  visits: DashboardVisit[],
  today: string,
): LongitudinalDashboardMetrics {
  const validVisitsByPatient = new Map<string, DashboardVisit[]>();
  for (const visit of visits) {
    if (!isValidClinicalVisit(visit)) continue;
    const patientVisits = validVisitsByPatient.get(visit.patient_id) ?? [];
    patientVisits.push(visit);
    validVisitsByPatient.set(visit.patient_id, patientVisits);
  }

  const baselinePriorityByPatient = new Map<string, 1 | 2 | 3>();
  const latestPriorityByPatient = new Map<string, 1 | 2 | 3>();
  const followupPriorityByPatient = new Map<string, 1 | 2 | 3>();
  const baselineScores: number[] = [];
  const latestScores: number[] = [];
  let patientsWithoutFollowup90d = 0;

  const threshold = new Date(`${today}T00:00:00Z`);
  threshold.setUTCDate(threshold.getUTCDate() - 90);
  const thresholdDate = threshold.toISOString().slice(0, 10);

  for (const patientId of patientIds) {
    const patientVisits = (validVisitsByPatient.get(patientId) ?? []).sort(compareClinicalVisits);
    if (patientVisits.length === 0) continue;

    const baselineVisit = patientVisits.find(isBaselineVisit);
    const latestVisit = patientVisits[patientVisits.length - 1];

    // Follow-up recency only uses attended dates (never scheduled/future dates).
    const attendedDates = patientVisits.map((visit) => visit.visit_date).filter((date): date is string => Boolean(date));
    const latestAttendedDate = attendedDates.sort()[attendedDates.length - 1];
    if (latestAttendedDate && latestAttendedDate < thresholdDate) patientsWithoutFollowup90d += 1;

    if (baselineVisit) {
      const baseline = firstScore(baselineVisit);
      const baselineLevel = priority(baseline?.priority);
      const baselineScore = numericScore(baseline?.score);
      if (baselineLevel !== null) baselinePriorityByPatient.set(patientId, baselineLevel);
      if (baselineScore !== null) baselineScores.push(baselineScore);

      const followupVisits = patientVisits
        .filter((visit) => !isBaselineVisit(visit))
        .filter((visit) => compareClinicalVisits(visit, baselineVisit) > 0)
        .filter((visit) => priority(firstScore(visit)?.priority) !== null);
      const followupVisit = followupVisits[followupVisits.length - 1];
      const followupLevel = priority(followupVisit ? firstScore(followupVisit)?.priority : null);
      if (followupLevel !== null) followupPriorityByPatient.set(patientId, followupLevel);
    }

    const latest = firstScore(latestVisit);
    const latestScore = numericScore(latest?.score);
    // Current CMO level = most recent stratification (same as the patient record);
    // unscored contacts (e.g. extraordinary visits) do not erase it.
    const latestStratified = [...patientVisits].reverse().find((visit) => priority(firstScore(visit)?.priority) !== null);
    const latestLevel = priority(latestStratified ? firstScore(latestStratified)?.priority : null);
    if (latestLevel !== null) latestPriorityByPatient.set(patientId, latestLevel);
    if (latestScore !== null) latestScores.push(latestScore);
  }

  let improved = 0;
  let worsened = 0;
  let stable = 0;
  baselinePriorityByPatient.forEach((baselineLevel, patientId) => {
    const followupLevel = followupPriorityByPatient.get(patientId);
    if (followupLevel === undefined) return;
    if (followupLevel > baselineLevel) improved += 1;
    else if (followupLevel < baselineLevel) worsened += 1;
    else stable += 1;
  });

  return {
    baselinePriorityByPatient,
    latestPriorityByPatient,
    improved,
    worsened,
    stable,
    averageBaselineScore: roundedAverage(baselineScores),
    averageLatestScore: roundedAverage(latestScores),
    patientsWithoutFollowup90d,
  };
}
