import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NEW_INTERVENTION_DEFAULTS, buildInterventionPayload } from '../src/services/interventionService';

const REMOVED_FIELDS = ['priority_level', 'linked_to_cmo_level', 'delivered'];

describe('Formulario de intervenciones simplificado', () => {
  const payload = buildInterventionPayload({
    interventionType: 'Promoción activa de la adherencia',
    cmoPillarLabel: 'Motivación',
    catalogItemId: '00000000-0000-4000-8000-000000000007',
    outcome: '',
    notes: 'Refuerzo en consulta',
  });

  it('el payload común (alta y edición) no contiene los campos retirados', () => {
    for (const field of REMOVED_FIELDS) expect(payload).not.toHaveProperty(field);
    expect(payload).toEqual({
      intervention_type: 'Promoción activa de la adherencia',
      intervention_domain: 'Motivación',
      catalog_item_id: '00000000-0000-4000-8000-000000000007',
      outcome: null,
      notes: 'Refuerzo en consulta',
    });
  });

  it('las altas nuevas se guardan como realizadas, sin prioridad ni nivel vinculado', () => {
    expect(NEW_INTERVENTION_DEFAULTS).toEqual({ delivered: true, priority_level: null, linked_to_cmo_level: null });
  });

  it('la página no muestra los campos retirados y la edición no reenvía los valores históricos', () => {
    const page = readFileSync(join(__dirname, '../src/pages/VisitInterventionsPage.tsx'), 'utf8');
    expect(page).not.toMatch(/Prioridad de la intervención/);
    expect(page).not.toMatch(/Nivel CMO vinculado/);
    expect(page).not.toMatch(/Intervención entregada/);
    // NEW_INTERVENTION_DEFAULTS solo se aplica en createIntervention, nunca en updateIntervention.
    expect(page).toMatch(/updateIntervention\(editingInterventionId, payload\)/);
    expect(page).toMatch(/createIntervention\(\{ \.\.\.payload, \.\.\.NEW_INTERVENTION_DEFAULTS, visit_id: visitId \}\)/);
  });
});
