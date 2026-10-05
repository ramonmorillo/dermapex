import { describe, expect, it } from 'vitest';

import { pickReferenceStratification } from '../src/utils/referenceStratification';

const entry = (priority: number | null, visit_date: string | null, scheduled_date: string | null = visit_date) =>
  ({ priority, visit_date, scheduled_date, created_at: null });

describe('pickReferenceStratification', () => {
  it('extraordinaria sin score hereda la última estratificación anterior, no una posterior', () => {
    const history = [entry(2, '2026-05-06'), entry(1, '2026-06-25')];
    expect(pickReferenceStratification(history, '2026-05-21')?.priority).toBe(2);
    expect(pickReferenceStratification(history, '2026-09-02')?.priority).toBe(1);
  });

  it('usa la fecha programada si la visita estratificada no tiene fecha real', () => {
    expect(pickReferenceStratification([entry(2, null, '2026-05-01')], '2026-05-10')?.priority).toBe(2);
  });

  it('visita sin fecha toma la última estratificación disponible', () => {
    expect(pickReferenceStratification([entry(3, '2026-01-01'), entry(1, '2026-03-01')], null)?.priority).toBe(1);
  });

  it('sin estratificación previa devuelve null (no asume nivel 3)', () => {
    expect(pickReferenceStratification([], '2026-05-10')).toBeNull();
    expect(pickReferenceStratification([entry(2, '2026-06-01')], '2026-05-10')).toBeNull();
    expect(pickReferenceStratification([entry(null, '2026-04-01')], '2026-05-10')).toBeNull();
  });
});
