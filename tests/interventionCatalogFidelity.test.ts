// D7: la semilla de intervention_catalog reproduce LITERALMENTE interventions-catalog.js de la fuente.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// @ts-expect-error · módulo JS de referencia sin tipos
import { INTERVENTIONS_CATALOG } from './reference/cmoinmunomediadas/interventions-catalog.js';
import { INTERVENTION_CATALOG_VERSION } from '../src/constants/dermapexStudyConfig';

type RefCard = {
  id: string;
  category: string;
  dimension: string;
  tier: string;
  text: string;
  recommendedLevels: number[];
  linkedNeedIds: string[];
};

const sql = readFileSync(resolve(__dirname, '../supabase/migrations/20261006100300_dermapex_intervention_catalog.sql'), 'utf8');
const seed = JSON.parse(
  sql.match(/-- BEGIN INTERVENTION_CATALOG_JSON\n\$json\$(.*)\$json\$\n-- END INTERVENTION_CATALOG_JSON/s)?.[1] ?? '[]',
) as Array<Record<string, unknown>>;

describe('catálogo de intervenciones = fuente (literal)', () => {
  it('20 tarjetas en el mismo orden', () => {
    expect(seed.map((r) => r.code)).toEqual((INTERVENTIONS_CATALOG as RefCard[]).map((c) => c.id));
  });

  it('texto, dimensión C/M/O, niveles recomendados, categoría, tier y necesidades idénticos', () => {
    (INTERVENTIONS_CATALOG as RefCard[]).forEach((card, index) => {
      expect(seed[index]).toEqual({
        code: card.id,
        label: card.text,
        category: card.category,
        cmo_pillar: card.dimension,
        tier: card.tier,
        recommended_levels: card.recommendedLevels,
        linked_need_ids: card.linkedNeedIds,
        sort_order: index + 1,
      });
    });
  });

  it('versión de catálogo de la migración = constante de la aplicación', () => {
    expect(INTERVENTION_CATALOG_VERSION).toBe('cmoinmunomediadas@227e444-draft');
    expect(sql).toContain(`'${INTERVENTION_CATALOG_VERSION}'`);
  });

  it('D8: todas las listas de la fuente son prefijos {1..k}, por lo que min_level = max(recommendedLevels) no pierde información hoy', () => {
    for (const card of INTERVENTIONS_CATALOG as RefCard[]) {
      const max = Math.max(...card.recommendedLevels);
      expect([...card.recommendedLevels].sort()).toEqual(Array.from({ length: max }, (_, i) => i + 1));
    }
  });
});
