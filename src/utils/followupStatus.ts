import type { StatusTone } from '../components/ui/StatusBadge';

export type FollowupStatus = {
  tone: StatusTone;
  label: string;
  lastAttendedDate: string | null;
};

const FOLLOWUP_GAP_DAYS = 90;

// Misma regla que el dashboard (dashboardAnalytics): solo cuentan fechas de visita realizadas,
// nunca fechas programadas, y se compara con hoy menos 90 días.
export function getFollowupStatus(visits: Array<{ visit_date: string | null }>, today = new Date()): FollowupStatus {
  const attended = visits
    .map((visit) => visit.visit_date)
    .filter((date): date is string => Boolean(date))
    .sort();
  const lastAttendedDate = attended[attended.length - 1] ?? null;

  if (!lastAttendedDate) return { tone: 'neutral', label: 'Sin visitas realizadas', lastAttendedDate };

  const threshold = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  threshold.setUTCDate(threshold.getUTCDate() - FOLLOWUP_GAP_DAYS);
  const thresholdDate = threshold.toISOString().slice(0, 10);

  if (lastAttendedDate < thresholdDate) {
    return { tone: 'warning', label: `Sin seguimiento >${FOLLOWUP_GAP_DAYS} días`, lastAttendedDate };
  }
  return { tone: 'positive', label: 'Seguimiento activo', lastAttendedDate };
}
