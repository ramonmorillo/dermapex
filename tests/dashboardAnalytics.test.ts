import { describe, expect, it } from 'vitest';

import { calculateLongitudinalDashboardMetrics, type DashboardVisit } from '../src/services/dashboardAnalytics';

function visit(
  id: string,
  patientId: string,
  type: string,
  date: string | null,
  score?: number | string | null,
  priority?: number | string | null,
  status: string | null = 'completed',
): DashboardVisit {
  return {
    id,
    patient_id: patientId,
    visit_type: type,
    visit_date: date,
    visit_status: status,
    created_at: `${date ?? '2026-01-01'}T12:00:00Z`,
    cmo_scores: score === undefined && priority === undefined ? [] : [{ score: score ?? null, priority: priority ?? null }],
  };
}

describe('calculateLongitudinalDashboardMetrics', () => {
  it.each([
    [1, 3],
    [1, 2],
    [2, 3],
  ])('clasifica %i→%i como mejora', (baselineLevel, followupLevel) => {
    const metrics = calculateLongitudinalDashboardMetrics(['A'], [
      visit('a-baseline', 'A', 'baseline', '2026-01-10', 49, baselineLevel),
      visit('a-3m', 'A', 'month_3', '2026-04-10', 26, followupLevel),
    ], '2026-09-24');

    expect(metrics).toMatchObject({ improved: 1, worsened: 0, stable: 0, averageBaselineScore: 49, averageLatestScore: 26 });
  });

  it('clasifica el caso real 1→3 usando la visita 3M aunque exista una visita posterior sin nivel CMO', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['A'], [
      visit('a-baseline', 'A', 'baseline', '2026-01-10', 49, 1),
      visit('a-3m', 'A', 'month_3', '2026-04-10', 26, 3),
      visit('a-extra-without-score', 'A', 'extra', '2026-05-10'),
    ], '2026-09-24');

    expect(metrics).toMatchObject({ improved: 1, worsened: 0, stable: 0 });
  });

  it.each([
    [3, 1],
    [3, 2],
    [2, 1],
  ])('clasifica %i→%i como empeoramiento', (baselineLevel, followupLevel) => {
    const metrics = calculateLongitudinalDashboardMetrics(['A'], [
      visit('a-baseline', 'A', 'baseline', '2026-01-10', 20, baselineLevel),
      visit('a-3m', 'A', 'month_3', '2026-04-10', 30, followupLevel),
    ], '2026-09-24');

    expect(metrics).toMatchObject({ improved: 0, worsened: 1, stable: 0 });
  });

  it.each([1, 2, 3])('clasifica %i→%i como estable', (level) => {
    const metrics = calculateLongitudinalDashboardMetrics(['A'], [
      visit('a-baseline', 'A', 'baseline', '2026-01-10', 30, level),
      visit('a-3m', 'A', 'month_3', '2026-04-10', 30, level),
    ], '2026-09-24');

    expect(metrics).toMatchObject({ improved: 0, worsened: 0, stable: 1 });
  });

  it('calcula empeoramiento 3→2 sin mezclar el historial de otro paciente', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['B'], [
      visit('b-baseline', 'B', 'baseline', '2026-01-10', 20, 3),
      visit('a-later', 'A', 'month_6', '2026-08-20', 5, 3),
      visit('b-3m', 'B', 'month_3', '2026-04-10', 30, 2),
    ], '2026-09-24');

    expect(metrics).toMatchObject({ improved: 0, worsened: 1, stable: 0, averageBaselineScore: 20, averageLatestScore: 30 });
  });

  it('mantiene estable el nivel y determina la última visita por fecha, no por tipo ni creación del score', () => {
    const rows = [
      visit('c-baseline', 'C', 'baseline', '2026-01-10', 32, 2),
      visit('c-extra', 'C', 'extra', '2026-05-20', 28, 2),
      visit('c-6m', 'C', 'month_6', '2026-07-20', 31, 2),
    ];
    rows[1].created_at = '2026-09-24T12:00:00Z';

    const metrics = calculateLongitudinalDashboardMetrics(['C'], rows, '2026-09-24');
    expect(metrics).toMatchObject({ improved: 0, worsened: 0, stable: 1, averageBaselineScore: 32, averageLatestScore: 31 });
  });

  it('usa una extraordinaria reciente para seguimiento y aplica estrictamente más de 90 días', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['recent', 'exactly90', 'old', 'unknown'], [
      visit('d-baseline', 'recent', 'baseline', '2026-01-10', 20, 2),
      visit('d-3m', 'recent', 'month_3', '2026-04-10', 20, 2),
      visit('d-extra', 'recent', 'extra', '2026-09-01', 20, 2),
      visit('e-latest', 'exactly90', 'month_3', '2026-06-26', 20, 2),
      visit('f-latest', 'old', 'month_3', '2026-06-25', 20, 2),
      visit('g-scheduled', 'unknown', 'baseline', null),
    ], '2026-09-24');

    expect(metrics.patientsWithoutFollowup90d).toBe(1);
  });

  it('excluye null y valores no numéricos sin ceros artificiales ni NaN', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['partial', 'complete'], [
      visit('p-baseline', 'partial', 'baseline', '2026-01-01', null, 2),
      visit('p-latest', 'partial', 'month_3', '2026-03-01', 'invalid', null),
      visit('q-baseline', 'complete', 'baseline', '2026-01-02', '10', '1'),
      visit('q-latest', 'complete', 'month_3', '2026-03-02', '20', '2'),
    ], '2026-04-01');

    expect(metrics.averageBaselineScore).toBe(10);
    expect(metrics.averageLatestScore).toBe(20);
    expect(Number.isNaN(metrics.averageLatestScore)).toBe(false);
  });

  it('elige una sola basal por paciente y no retrocede si la última visita carece de score', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['duplicate'], [
      visit('first-baseline', 'duplicate', 'baseline', '2026-01-01', 40, 1),
      visit('duplicate-baseline', 'duplicate', 'baseline', '2026-02-01', 10, 3),
      visit('latest-without-score', 'duplicate', 'month_3', '2026-04-01'),
    ], '2026-04-02');

    expect(metrics.averageBaselineScore).toBe(40);
    expect(metrics.averageLatestScore).toBe(0);
    expect(metrics.improved + metrics.worsened + metrics.stable).toBe(0);
  });

  it('no clasifica como estable a un paciente sin visita posterior a la basal', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['baseline-only'], [
      visit('only-baseline', 'baseline-only', 'baseline', '2026-01-01', 30, 2),
    ], '2026-04-02');

    expect(metrics).toMatchObject({ improved: 0, worsened: 0, stable: 0 });
  });

  it('incluye una visita programada con fecha clínica y estratificación válida', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['scheduled'], [
      visit('scheduled-baseline', 'scheduled', 'baseline', '2026-01-01', 49, 1, 'scheduled'),
      visit('scheduled-3m', 'scheduled', 'month_3', '2026-04-01', 26, 3, 'scheduled'),
    ], '2026-04-02');

    expect(metrics).toMatchObject({ improved: 1, worsened: 0, stable: 0 });
  });

  it('caso real: basal estratificada sin fecha ni estado completado (N1) y 3M programada con fecha (N3) cuenta como mejora', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['real'], [
      visit('real-3m', 'real', 'month_3', '2026-09-24', 26, 3, 'scheduled'),
      visit('real-baseline', 'real', 'baseline', null, 49, 1, 'scheduled'),
    ], '2026-09-24');

    expect(metrics).toMatchObject({ improved: 1, worsened: 0, stable: 0, averageBaselineScore: 49, averageLatestScore: 26 });
    expect(metrics.latestPriorityByPatient.get('real')).toBe(3);
    expect(metrics.patientsWithoutFollowup90d).toBe(0);
  });

  it('una fecha solo programada no cuenta como seguimiento realizado', () => {
    const rows = [
      visit('s-baseline', 'S', 'baseline', '2026-01-01', 30, 2),
      visit('s-3m', 'S', 'month_3', null, 30, 2, 'scheduled'),
    ];
    rows[1].scheduled_date = '2026-10-01';

    const metrics = calculateLongitudinalDashboardMetrics(['S'], rows, '2026-09-24');
    expect(metrics).toMatchObject({ stable: 1, patientsWithoutFollowup90d: 1 });
  });

  it('el nivel actual es la última estratificación aunque después haya extraordinarias sin score', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['X'], [
      visit('x-baseline', 'X', 'baseline', '2026-05-06', 29, 2),
      visit('x-extra-scored', 'X', 'extra', '2026-06-25', 34, 1),
      visit('x-extra-unscored', 'X', 'extra', '2026-09-02'),
    ], '2026-09-24');

    expect(metrics.latestPriorityByPatient.get('X')).toBe(1);
    expect(metrics).toMatchObject({ worsened: 1, averageLatestScore: 0 });
  });

  it('trayectoria no monótona N1→N3→N2: compara basal con la última estratificación de seguimiento', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['T'], [
      visit('t-baseline', 'T', 'baseline', null, 49, 1, 'scheduled'),
      visit('t-3m', 'T', 'month_3', null, 26, 3, 'scheduled'),
      visit('t-6m', 'T', 'month_6', '2026-09-25', 30, 2, 'scheduled'),
    ].map((row) => (row.id === 't-3m' ? { ...row, scheduled_date: '2026-09-24' } : row)), '2026-09-24');

    expect(metrics).toMatchObject({ improved: 1, worsened: 0, stable: 0, averageBaselineScore: 49, averageLatestScore: 30 });
    expect(metrics.latestPriorityByPatient.get('T')).toBe(2);
  });

  it('excluye visitas canceladas aunque tengan una fecha posterior', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['cancelled'], [
      visit('valid', 'cancelled', 'baseline', '2026-01-01', 40, 1),
      visit('cancelled-later', 'cancelled', 'extra', '2026-09-20', 10, 3, 'cancelled'),
    ], '2026-09-24');

    expect(metrics.averageLatestScore).toBe(40);
    expect(metrics.patientsWithoutFollowup90d).toBe(1);
  });
});
