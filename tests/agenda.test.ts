import { describe, expect, it } from 'vitest';

import {
  agendaDate,
  buildMonthGrid,
  filterAgendaVisits,
  formatLongDate,
  getAgendaStatus,
  groupByDate,
  shiftMonth,
  suggestNextVisitType,
  summarizeAgenda,
  type AgendaVisit,
} from '../src/utils/agenda';

const TODAY = '2026-10-28';

function visit(partial: Partial<AgendaVisit> & { id: string }): AgendaVisit {
  return {
    patient_id: 'p1',
    study_code: 'DPX-01-001',
    visit_type: 'baseline',
    scheduled_date: null,
    visit_date: null,
    visit_status: 'scheduled',
    ...partial,
  };
}

describe('getAgendaStatus', () => {
  it('cancelada prevalece aunque tenga fecha realizada', () => {
    expect(getAgendaStatus(visit({ id: 'a', visit_status: 'cancelled', visit_date: '2026-10-01' }), TODAY)).toBe('cancelled');
  });
  it('fecha realizada implica realizada aunque el estado siga en programada', () => {
    expect(getAgendaStatus(visit({ id: 'a', visit_date: '2026-10-01' }), TODAY)).toBe('completed');
  });
  it('programada en el pasado sin realizar = vencida; hoy no está vencida', () => {
    expect(getAgendaStatus(visit({ id: 'a', scheduled_date: '2026-10-27' }), TODAY)).toBe('overdue');
    expect(getAgendaStatus(visit({ id: 'a', scheduled_date: TODAY }), TODAY)).toBe('scheduled');
  });
});

describe('agendaDate', () => {
  it('usa la fecha realizada antes que la programada', () => {
    expect(agendaDate({ scheduled_date: '2026-10-01', visit_date: '2026-10-03' })).toBe('2026-10-03');
    expect(agendaDate({ scheduled_date: '2026-10-01', visit_date: null })).toBe('2026-10-01');
    expect(agendaDate({ scheduled_date: null, visit_date: null })).toBeNull();
  });
});

describe('buildMonthGrid', () => {
  it('octubre 2026 empieza en lunes 28/09 y tiene 42 celdas', () => {
    const grid = buildMonthGrid('2026-10');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ iso: '2026-09-28', inMonth: false });
    expect(grid[3]).toEqual({ iso: '2026-10-01', inMonth: true });
    expect(grid.filter((d) => d.inMonth)).toHaveLength(31);
  });
  it('mes que empieza en domingo deja 6 días previos', () => {
    // 1 de marzo de 2026 es domingo.
    expect(buildMonthGrid('2026-03')[6]).toEqual({ iso: '2026-03-01', inMonth: true });
  });
});

describe('shiftMonth / formatLongDate', () => {
  it('cruza el cambio de año', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('formatea en español', () => {
    expect(formatLongDate('2026-10-28')).toBe('Miércoles, 28 de octubre de 2026');
  });
});

describe('filterAgendaVisits', () => {
  const visits = [
    visit({ id: '1', patient_id: 'p1', scheduled_date: '2026-10-05', visit_date: '2026-10-06', visit_status: 'completed' }),
    visit({ id: '2', patient_id: 'p2', study_code: 'DPX-01-002', scheduled_date: '2026-10-20' }),
    visit({ id: '3', patient_id: 'p1', visit_type: 'month_6', scheduled_date: '2026-11-10' }),
    visit({ id: '4', patient_id: 'p1', visit_type: 'extra' }),
  ];

  it('filtra por mes según la fecha de agenda y ordena cronológicamente', () => {
    expect(filterAgendaVisits(visits, { month: '2026-10', patientId: null, statuses: [] }, TODAY).map((v) => v.id)).toEqual(['1', '2']);
  });
  it('filtra por paciente sin periodo (incluye visitas sin fecha al final)', () => {
    expect(filterAgendaVisits(visits, { month: null, patientId: 'p1', statuses: [] }, TODAY).map((v) => v.id)).toEqual(['1', '3', '4']);
  });
  it('filtra por estado', () => {
    expect(filterAgendaVisits(visits, { month: null, patientId: null, statuses: ['overdue'] }, TODAY).map((v) => v.id)).toEqual(['2']);
  });
  it('agrupa por fecha y resume estados', () => {
    const grouped = groupByDate(visits);
    expect(grouped.get('2026-10-06')?.map((v) => v.id)).toEqual(['1']);
    expect(grouped.has('2026-10-05')).toBe(false);
    expect(summarizeAgenda(visits, TODAY)).toEqual({ total: 4, completed: 1, scheduled: 2, overdue: 1, cancelled: 0 });
  });
});

describe('suggestNextVisitType', () => {
  it('propone la primera visita del calendario no registrada, ignorando canceladas', () => {
    expect(suggestNextVisitType([])).toBe('baseline');
    expect(suggestNextVisitType([{ visit_type: 'baseline', visit_status: 'completed' }])).toBe('month_3');
    expect(suggestNextVisitType([{ visit_type: 'baseline', visit_status: 'cancelled' }])).toBe('baseline');
  });
  it('con el calendario completo propone extraordinaria', () => {
    const all = ['baseline', 'month_3', 'month_6', 'month_9', 'month_12'].map((t) => ({ visit_type: t, visit_status: 'completed' }));
    expect(suggestNextVisitType(all)).toBe('extra');
  });
});
