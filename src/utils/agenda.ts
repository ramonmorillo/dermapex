import { VISIT_TYPE_OPTIONS, getVisitTypeSortOrder, normalizeVisitTypeValue, type VisitType } from '../constants/enums';
import type { StatusTone } from '../components/ui/StatusBadge';

// Agenda = visitas de la tabla `visits` situadas en el calendario. No existe tabla de citas propia:
// una cita es una visita con visit_status = 'scheduled' y scheduled_date.
export type AgendaVisit = {
  id: string;
  patient_id: string;
  study_code: string | null;
  visit_type: string | null;
  scheduled_date: string | null;
  visit_date: string | null;
  visit_status: string | null;
  notes?: string | null;
};

export type AgendaStatus = 'completed' | 'scheduled' | 'overdue' | 'cancelled';

export const AGENDA_STATUS_LABELS: Record<AgendaStatus, string> = {
  completed: 'Realizada',
  scheduled: 'Programada',
  overdue: 'Programada vencida',
  cancelled: 'Cancelada',
};

export const AGENDA_STATUS_TONES: Record<AgendaStatus, StatusTone> = {
  completed: 'positive',
  scheduled: 'info',
  overdue: 'warning',
  cancelled: 'neutral',
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Fecha local en formato ISO (YYYY-MM-DD), sin desplazamiento por zona horaria. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Clave de mes YYYY-MM. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return toIsoDate(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}

export function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function formatLongDate(iso: string): string {
  const date = parseIsoDate(iso);
  return `${WEEKDAY_NAMES[date.getDay()]}, ${date.getDate()} de ${MONTH_NAMES[date.getMonth()].toLowerCase()} de ${date.getFullYear()}`;
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Fecha en la que la visita ocupa la agenda: la fecha realizada si existe; si no, la programada.
 * Misma precedencia que el resto de la app (visit_date ?? scheduled_date).
 */
export function agendaDate(visit: Pick<AgendaVisit, 'visit_date' | 'scheduled_date'>): string | null {
  return (visit.visit_date ?? visit.scheduled_date)?.slice(0, 10) ?? null;
}

/**
 * Estado de seguimiento:
 * - cancelled: visit_status = 'cancelled' (prevalece).
 * - completed: visit_status = 'completed' o consta fecha de realización.
 * - overdue: programada, sin fecha de realización y con fecha programada anterior a hoy.
 * - scheduled: resto (programada pendiente o sin estado).
 */
export function getAgendaStatus(
  visit: Pick<AgendaVisit, 'visit_status' | 'visit_date' | 'scheduled_date'>,
  todayIso: string,
): AgendaStatus {
  if (visit.visit_status === 'cancelled') return 'cancelled';
  if (visit.visit_status === 'completed' || visit.visit_date) return 'completed';
  if (visit.scheduled_date && visit.scheduled_date.slice(0, 10) < todayIso) return 'overdue';
  return 'scheduled';
}

export type CalendarDay = { iso: string; inMonth: boolean };

/** Rejilla de 6 semanas (42 días) empezando en lunes, para el mes `key` (YYYY-MM). */
export function buildMonthGrid(key: string): CalendarDay[] {
  const [y, m] = key.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const start = toIsoDate(new Date(y, m - 1, 1 - offset));
  return Array.from({ length: 42 }, (_, i) => {
    const iso = addDays(start, i);
    return { iso, inMonth: monthKey(iso) === key };
  });
}

export type AgendaFilters = {
  /** YYYY-MM; null = sin restricción de periodo. */
  month: string | null;
  /** null = todos los pacientes. */
  patientId: string | null;
  /** Estados incluidos; vacío = todos. */
  statuses: AgendaStatus[];
};

export function compareAgendaVisits(a: AgendaVisit, b: AgendaVisit): number {
  const byDate = (agendaDate(a) ?? '9999-12-31').localeCompare(agendaDate(b) ?? '9999-12-31');
  if (byDate !== 0) return byDate;
  const byCode = (a.study_code ?? '').localeCompare(b.study_code ?? '');
  if (byCode !== 0) return byCode;
  return getVisitTypeSortOrder(a.visit_type) - getVisitTypeSortOrder(b.visit_type);
}

export function filterAgendaVisits(visits: AgendaVisit[], filters: AgendaFilters, todayIso: string): AgendaVisit[] {
  return visits
    .filter((visit) => {
      if (filters.patientId && visit.patient_id !== filters.patientId) return false;
      const date = agendaDate(visit);
      if (filters.month && (!date || monthKey(date) !== filters.month)) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(getAgendaStatus(visit, todayIso))) return false;
      return true;
    })
    .sort(compareAgendaVisits);
}

/** Visitas agrupadas por fecha de agenda (las visitas sin fecha no aparecen en el calendario). */
export function groupByDate(visits: AgendaVisit[]): Map<string, AgendaVisit[]> {
  const map = new Map<string, AgendaVisit[]>();
  for (const visit of visits) {
    const date = agendaDate(visit);
    if (!date) continue;
    const list = map.get(date) ?? [];
    list.push(visit);
    map.set(date, list);
  }
  return map;
}

export type AgendaSummary = Record<AgendaStatus, number> & { total: number };

export function summarizeAgenda(visits: AgendaVisit[], todayIso: string): AgendaSummary {
  const summary: AgendaSummary = { total: 0, completed: 0, scheduled: 0, overdue: 0, cancelled: 0 };
  for (const visit of visits) {
    summary[getAgendaStatus(visit, todayIso)] += 1;
    summary.total += 1;
  }
  return summary;
}

/**
 * Tipo de visita sugerido para una nueva cita: la primera visita del calendario del estudio
 * (basal → mes 12) que el paciente aún no tiene registrada (sin contar canceladas). Si ya las tiene
 * todas, se sugiere una extraordinaria. Es solo una sugerencia editable.
 */
export function suggestNextVisitType(patientVisits: Array<Pick<AgendaVisit, 'visit_type' | 'visit_status'>>): VisitType {
  const used = new Set(
    patientVisits
      .filter((visit) => visit.visit_status !== 'cancelled')
      .map((visit) => normalizeVisitTypeValue(visit.visit_type)),
  );
  const next = VISIT_TYPE_OPTIONS.find((option) => option.value !== 'extra' && !used.has(option.value));
  return next?.value ?? 'extra';
}
