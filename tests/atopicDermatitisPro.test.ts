import { describe, expect, it } from 'vitest';

import {
  POEM_INSTRUMENT_VERSION,
  POEM_ITEMS,
  POEM_OPTIONS,
  PRURITUS_NRS_RECALL_PERIOD,
  PRURITUS_NRS_VARIANT,
  buildPoemResponses,
  buildPruritusNrsResponses,
  isResponseItemKey,
  longitudinalChange,
  poemBand,
  scorePoem,
  scorePruritusNrs,
} from '../src/services/atopicDermatitisPro';
import {
  CANONICAL_QUESTIONNAIRE_CODE,
  REQUIRED_VISIT_QUESTIONNAIRES,
  deriveQuestionnaireScores,
  formatQuestionnaireResult,
  isQuestionnaireRecordComplete,
  missingRequiredQuestionnaires,
  normalizeQuestionnaireCode,
} from '../src/services/questionnaireDomain';

const all = (value: number) => Object.fromEntries(POEM_ITEMS.map((i) => [i.key, value]));

describe('POEM', () => {
  it('tiene 7 ítems y opciones 0-4 del documento aportado', () => {
    expect(POEM_ITEMS).toHaveLength(7);
    expect(POEM_OPTIONS.map((o) => o.value)).toEqual([0, 1, 2, 3, 4]);
    expect(POEM_OPTIONS.map((o) => o.label)).toEqual(['Ningún día', '1-2 días', '3-4 días', '5-6 días', 'Todos los días']);
  });

  it('puntúa los extremos 0 y 28', () => {
    expect(scorePoem(all(0))).toMatchObject({ total: 0, complete: true, missingItems: 0, band: 'limpio' });
    expect(scorePoem(all(4))).toMatchObject({ total: 28, complete: true, missingItems: 0, band: 'muy_grave' });
    expect(scorePoem({ q1: 4, q2: 3, q3: 2, q4: 1, q5: 0, q6: 1, q7: 2 }).total).toBe(13);
  });

  it('no calcula total si falta cualquier ítem (regla estricta), pero cuenta ausentes', () => {
    const { q7: _omit, ...six } = all(4);
    expect(scorePoem(six)).toMatchObject({ total: null, complete: false, answeredItems: 6, missingItems: 1, band: null });
    expect(scorePoem({})).toMatchObject({ total: null, answeredItems: 0, missingItems: 7 });
  });

  it('rechaza valores fuera de rango o no enteros (no puntúan y se señalan)', () => {
    for (const bad of [5, -1, 2.5, '3', true, null]) {
      const score = scorePoem({ ...all(1), q3: bad });
      expect(score.total).toBeNull();
      if (bad !== null) expect(score.invalidItems).toEqual(['q3']);
    }
  });

  it('bandas en los límites del documento (0-2, 3-7, 8-16, 17-24, 25-28)', () => {
    expect([0, 2, 3, 7, 8, 16, 17, 24, 25, 28].map(poemBand)).toEqual(['limpio', 'limpio', 'leve', 'leve', 'moderada', 'moderada', 'grave', 'grave', 'muy_grave', 'muy_grave']);
    expect(poemBand(null)).toBeNull();
    expect(poemBand(29)).toBeNull();
  });

  it('ausente ≠ 0: solo se guardan los ítems contestados, con la versión', () => {
    const saved = buildPoemResponses({ q1: 0, q2: null, q3: 2 });
    expect(saved).toEqual({ _version: POEM_INSTRUMENT_VERSION, q1: 0, q3: 2 });
    expect('q2' in saved).toBe(false);
  });

  it('se integra en el dominio genérico de cuestionarios', () => {
    expect(CANONICAL_QUESTIONNAIRE_CODE.poem).toBe('POEM');
    expect(normalizeQuestionnaireCode('POEM')).toBe('poem');
    expect(deriveQuestionnaireScores('poem', { _version: POEM_INSTRUMENT_VERSION, ...all(4) })).toEqual({ totalScore: 28, secondaryScore: 0 });
    expect(deriveQuestionnaireScores('poem', { q1: 1 })).toEqual({ totalScore: null, secondaryScore: 6 });
  });
});

describe('NRS de prurito (peor picor 24 h)', () => {
  it('registra 0-10 con variante y periodo de recuerdo', () => {
    expect(buildPruritusNrsResponses(0)).toEqual({ _variant: PRURITUS_NRS_VARIANT, _recall_period: PRURITUS_NRS_RECALL_PERIOD, score: 0 });
    expect(scorePruritusNrs(buildPruritusNrsResponses(10))).toEqual({ score: 10, variant: 'worst_itch_nrs_24h', recallPeriod: '24h', invalid: false });
  });

  it('distingue 0 de dato ausente', () => {
    const absent = buildPruritusNrsResponses(null);
    expect('score' in absent).toBe(false);
    expect(scorePruritusNrs(absent).score).toBeNull();
    expect(scorePruritusNrs(buildPruritusNrsResponses(0)).score).toBe(0);
    expect(deriveQuestionnaireScores('pruritus_nrs', absent).totalScore).toBeNull();
    expect(deriveQuestionnaireScores('pruritus_nrs', buildPruritusNrsResponses(0)).totalScore).toBe(0);
  });

  it('rechaza valores fuera de rango o no enteros', () => {
    for (const bad of [11, -1, 3.5, '5']) {
      expect(buildPruritusNrsResponses(bad as number)).not.toHaveProperty('score');
      expect(scorePruritusNrs({ score: bad })).toMatchObject({ score: null, invalid: true });
    }
  });

  it('texto de resumen indica la variante', () => {
    const text = formatQuestionnaireResult({ id: 'x', patient_id: 'p', visit_id: 'v', visit_type: 'baseline', questionnaire_type: 'pruritus_nrs', responses: buildPruritusNrsResponses(7), total_score: 7, secondary_score: null });
    expect(text).toContain('peor picor');
    expect(text).toContain('7/10');
  });
});

describe('Cambio longitudinal (mes 12 − basal)', () => {
  it('final menos basal, solo con dos mediciones válidas', () => {
    expect(longitudinalChange(20, 8)).toBe(-12);
    expect(longitudinalChange(0, 28)).toBe(28);
    expect(longitudinalChange(0, 0)).toBe(0);
    expect(longitudinalChange(null, 8)).toBeNull();
    expect(longitudinalChange(5, undefined)).toBeNull();
  });

  it('exige comparabilidad (misma versión/variante) cuando se indica', () => {
    expect(longitudinalChange(3, 1, { baseline: 'worst_itch_nrs_24h', final: 'worst_itch_nrs_24h' })).toBe(-2);
    expect(longitudinalChange(3, 1, { baseline: 'worst_itch_nrs_24h', final: 'peak_pruritus_nrs' })).toBeNull();
    expect(longitudinalChange(3, 1, { baseline: null, final: 'worst_itch_nrs_24h' })).toBeNull();
  });

  it('los metadatos «_…» no son ítems', () => {
    expect(isResponseItemKey('_version')).toBe(false);
    expect(isResponseItemKey('q1')).toBe(true);
    expect(isResponseItemKey('score')).toBe(true);
  });
});

describe('Cuestionarios obligatorios de la visita (aviso de la ficha)', () => {
  const rec = (questionnaire_type: Parameters<typeof isQuestionnaireRecordComplete>[0], responses: Record<string, unknown> = {}) => ({ questionnaire_type, responses });
  const previous = ['iexpac', 'dlqi', 'evasaf', 'morisky', 'eq5d'] as const;
  const fullPoem = buildPoemResponses({ q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0, q7: 0 });

  it('POEM y NRS pasan a ser obligatorios; PAM-10 sigue sin serlo', () => {
    expect(REQUIRED_VISIT_QUESTIONNAIRES).toEqual(['iexpac', 'dlqi', 'evasaf', 'morisky', 'eq5d', 'poem', 'pruritus_nrs']);
    expect(REQUIRED_VISIT_QUESTIONNAIRES).not.toContain('pam10');
  });

  it('una visita con los instrumentos previos pero sin POEM/NRS queda pendiente', () => {
    expect(missingRequiredQuestionnaires(previous.map((t) => rec(t)))).toEqual(['poem', 'pruritus_nrs']);
  });

  it('completa con POEM de 7 ítems y NRS registrada (también con 0 en ambos)', () => {
    const records = [...previous.map((t) => rec(t)), rec('poem', fullPoem), rec('pruritus_nrs', buildPruritusNrsResponses(0))];
    expect(missingRequiredQuestionnaires(records)).toEqual([]);
  });

  it('POEM en borrador o NRS sin valor no cuentan como cumplimentados', () => {
    const records = [...previous.map((t) => rec(t)), rec('poem', buildPoemResponses({ q1: 2, q2: 1 })), rec('pruritus_nrs', buildPruritusNrsResponses(null))];
    expect(missingRequiredQuestionnaires(records)).toEqual(['poem', 'pruritus_nrs']);
    expect(isQuestionnaireRecordComplete('poem', fullPoem)).toBe(true);
    expect(isQuestionnaireRecordComplete('pruritus_nrs', buildPruritusNrsResponses(10))).toBe(true);
  });

  it('el criterio de los instrumentos previos no cambia (basta con que exista el registro)', () => {
    for (const t of previous) expect(isQuestionnaireRecordComplete(t, {})).toBe(true);
  });
});
