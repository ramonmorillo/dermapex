import { describe, expect, it } from 'vitest';

import { CMO_LEVEL_META, cmoLevelLabel } from '../src/constants/cmoLevels';
import { CMO_ANSWER_FIELDS } from '../src/constants/cmoDermapexModel';
import { COMPARATOR_STRATIFICATION_VISIBLE, PROTOCOL_LEVEL_PACKAGES, STRATIFICATION_REASONS } from '../src/constants/dermapexStudyConfig';
import {
  buildSavePayload,
  canViewCmoResults,
  computeDraft,
  draftAnswersFromItems,
  missingAnswerCodes,
  prefillSexAnswer,
  sortStratificationsDesc,
  validateDraft,
  type StratificationDraft,
  type StratificationItemValueRow,
  type StratificationRegistryRow,
} from '../src/services/cmoStratificationService';
import { filterCatalogForLevel, type InterventionCatalogItem } from '../src/services/interventionCatalogService';
import { CMO_NOT_APPLICABLE_LABEL, describeCmoForReport } from '../src/services/reportService';
import { buildStratificationExportRows, encodeRawValue, stratificationSpssDictionary } from '../src/services/stratificationExport';

function completeDraft(overrides: Partial<StratificationDraft> = {}): StratificationDraft {
  const answers: Record<string, string> = {};
  for (const f of CMO_ANSWER_FIELDS) answers[f.code] = f.valueType === 'select' ? 'ninguna' : 'no';
  return { visitId: 'v1', reason: 'baseline', age: 50, answers, informative: { conservacion_especial: 'no' }, ...overrides };
}

describe('visibilidad por cohorte (D5)', () => {
  it('el flag del comparador está desactivado', () => {
    expect(COMPARATOR_STRATIFICATION_VISIBLE).toBe(false);
  });
  it.each([
    ['cmo', 'investigator', true],
    ['standard', 'investigator', false],
    ['standard', 'coordinator', true],
    [null, 'investigator', false],
    ['cmo', null, true],
  ] as const)('cohorte %s · rol %s → %s', (arm, role, expected) => {
    expect(canViewCmoResults(arm, role)).toBe(expected);
  });
});

describe('borrador de estratificación', () => {
  it('sexo precargado desde la ficha (editable)', () => {
    expect(prefillSexAnswer('female')).toBe('si');
    expect(prefillSexAnswer('male')).toBe('no');
    expect(prefillSexAnswer('other')).toBeUndefined();
    expect(prefillSexAnswer(null)).toBeUndefined();
  });

  it('motivo obligatorio con los seis valores de D6', () => {
    expect(STRATIFICATION_REASONS.map((r) => r.value)).toEqual(['baseline', 'month_6', 'month_12', 'treatment_change', 'clinical_change', 'need_detected']);
    expect(validateDraft(completeDraft({ reason: '' }))).toContain('Selecciona el motivo de la estratificación.');
    expect(validateDraft(completeDraft())).toEqual([]);
  });

  it('exige respuesta explícita en cada variable (incluida la informativa)', () => {
    const draft = completeDraft();
    delete draft.answers.tabaquismo;
    draft.informative = {};
    expect(missingAnswerCodes(draft)).toEqual(['tabaquismo', 'conservacion_especial']);
    expect(validateDraft(draft).join(' ')).toContain('Pendientes: 2');
  });

  it('la vista previa trata lo no respondido como desconocido', () => {
    const r = computeDraft({ age: 40, answers: { naive_terapia: 'si' }, informative: {} });
    expect(r.totalScore).toBe(6);
    expect(r.incomplete).toBe(true);
  });

  it('payload del RPC: todas las respuestas + informativa, versiones y resultado del cliente', () => {
    const draft = completeDraft({ answers: { ...completeDraft().answers, embarazada: 'si' } });
    const result = computeDraft(draft);
    const payload = buildSavePayload(draft, result);
    expect(Object.keys(payload.p_answers)).toHaveLength(27);
    expect(payload.p_answers.conservacion_especial).toBe('no');
    expect(payload.p_answers).not.toHaveProperty('edad_grupo');
    expect(payload).toMatchObject({
      p_visit_id: 'v1',
      p_reason: 'baseline',
      p_engine_version: 'cmo-dermapex-1.0.0+src.227e444',
      p_model_version: 'cmo-derma-model-1.0.0+src.227e444',
      p_client_total: 5,
      p_client_level: 1,
    });
  });

  it('reconstruye respuestas desde los ítems guardados', () => {
    const items = [
      { variable_code: 'tabaquismo', raw_value: { value: 'si' } },
      { variable_code: 'edad_grupo', raw_value: { value: '18-69', age: 40 } },
      { variable_code: 'conservacion_especial', raw_value: { value: 'unknown' } },
    ] as StratificationItemValueRow[];
    expect(draftAnswersFromItems(items)).toEqual({ answers: { tabaquismo: 'si' }, informative: { conservacion_especial: 'unknown' } });
  });

  it('historial ordenado por fecha de visita descendente', () => {
    const rows = [
      { visit_date: '2026-01-01', scheduled_date: null, created_at: '2026-01-01T10:00:00Z' },
      { visit_date: '2026-07-01', scheduled_date: null, created_at: '2026-07-01T10:00:00Z' },
      { visit_date: null, scheduled_date: '2026-03-01', created_at: '2026-03-01T10:00:00Z' },
    ];
    expect(sortStratificationsDesc(rows).map((r) => r.visit_date ?? r.scheduled_date)).toEqual(['2026-07-01', '2026-03-01', '2026-01-01']);
  });
});

describe('catálogo de intervenciones por nivel (D8)', () => {
  const card = (code: string, levels: Array<1 | 2 | 3>, active = true) =>
    ({ id: code, code, label: code, cmo_pillar: 'capacidad', category: 'seguimiento', tier: 'basica', recommended_levels: levels, min_level: Math.max(...levels), catalog_version: 'x', sort_order: 1, is_active: active }) as InterventionCatalogItem;
  const catalog = [card('todos', [1, 2, 3]), card('solo1', [1]), card('1y2', [1, 2]), card('retirada', [1, 2, 3], false)];

  it('filtra por niveles recomendados del nivel vigente', () => {
    expect(filterCatalogForLevel(catalog, 1, false).map((c) => c.code)).toEqual(['todos', 'solo1', '1y2']);
    expect(filterCatalogForLevel(catalog, 2, false).map((c) => c.code)).toEqual(['todos', '1y2']);
    expect(filterCatalogForLevel(catalog, 3, false).map((c) => c.code)).toEqual(['todos']);
  });
  it('«ver todas» y sin nivel muestran todo lo activo', () => {
    expect(filterCatalogForLevel(catalog, 3, true)).toHaveLength(3);
    expect(filterCatalogForLevel(catalog, null, false)).toHaveLength(3);
  });
});

describe('etiquetas de nivel e informe (R10)', () => {
  it('etiquetas unificadas; desaparece «N3 · Basal»', () => {
    expect(CMO_LEVEL_META[1].label).toBe('Nivel 1 · Prioridad 1 (mayor complejidad)');
    expect(CMO_LEVEL_META[2].label).toBe('Nivel 2 · Prioridad 2 (complejidad intermedia)');
    expect(CMO_LEVEL_META[3].label).toBe('Nivel 3 · Prioridad 3 (menor complejidad)');
    expect(Object.values(CMO_LEVEL_META).map((m) => m.shortLabel).join()).not.toContain('Basal');
    expect(cmoLevelLabel(null)).toBe('No disponible');
  });

  it('R10: el informe no presenta la puntuación como prioridad', () => {
    const text = describeCmoForReport(23, 2, true);
    expect(text.patientSentence).toBe('Su nivel de atención farmacéutica CMO actual es: Nivel 2 · Prioridad 2 (complejidad intermedia)');
    expect(text.patientSentence).not.toContain('23');
    expect(text.scoreLabel).toBe('23 puntos · Nivel 2 · Prioridad 2 (complejidad intermedia)');
    expect(text.clinicalSentence).toBe('Estratificación CMO: 23 puntos · Nivel 2 · Prioridad 2 (complejidad intermedia).');
  });

  it('centros estándar: el informe no incluye resultados CMO', () => {
    const text = describeCmoForReport(31, 1, false);
    expect(text.levelLabel).toBe(CMO_NOT_APPLICABLE_LABEL);
    expect(text.patientSentence).toBeNull();
    expect(JSON.stringify(text)).not.toContain('31');
  });

  it('paquetes mínimos del protocolo para los tres niveles (anexo A)', () => {
    expect(PROTOCOL_LEVEL_PACKAGES[1].actions).toHaveLength(8);
    expect(PROTOCOL_LEVEL_PACKAGES[2].actions).toHaveLength(6);
    expect(PROTOCOL_LEVEL_PACKAGES[3].actions).toHaveLength(5);
  });
});

describe('exportación de estratificaciones', () => {
  it('codificación 0 = no, 1 = sí, 9 = desconocido; cardiometabólica 0/1/2; edad 1-4', () => {
    expect(encodeRawValue('tabaquismo', 'no')).toBe(0);
    expect(encodeRawValue('tabaquismo', 'si')).toBe(1);
    expect(encodeRawValue('tabaquismo', 'unknown')).toBe(9);
    expect(encodeRawValue('comorbilidades_cv_diabetes', 'mas-una')).toBe(2);
    expect(encodeRawValue('edad_grupo', '18-69')).toBe(3);
    expect(encodeRawValue('edad_grupo', '≥70')).toBe(4);
    expect(encodeRawValue('conservacion_especial', 'si')).toBe(1);
    expect(encodeRawValue('tabaquismo', null)).toBeNull();
  });

  const registry: StratificationRegistryRow[] = [
    {
      id: 's1', visit_id: 'v1', patient_id: 'p1', center_id: 'c1', study_arm: 'standard', visit_type: 'baseline', visit_number: 1,
      visit_date: '2026-10-01', scheduled_date: null, stratification_reason: 'treatment_change', engine_version: 'e', model_version: 'm',
      incomplete: true, unknown_count: 1, unknown_variables: ['tabaquismo'], created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z',
      results_visible: false, score: null, priority: null, special_rule_applied: null, block_scores: null,
    },
  ];
  const items = [
    { cmo_score_id: 's1', variable_code: 'tabaquismo', raw_value: { value: 'unknown' } },
    { cmo_score_id: 's1', variable_code: 'naive_terapia', raw_value: { value: 'si' } },
    { cmo_score_id: 's1', variable_code: 'edad_grupo', raw_value: { value: '18-69', age: 50 } },
    { cmo_score_id: 's1', variable_code: 'conservacion_especial', raw_value: { value: 'no' } },
  ] as StratificationItemValueRow[];

  it('una fila por estratificación con cohorte, motivo, versión, desconocidas y cada variable; resultados vacíos si están enmascarados', () => {
    const [row] = buildStratificationExportRows(registry, items, {
      patientIdAnon: () => 'P0001',
      visitIdAnon: () => 'V00001',
      centerCode: () => 'C1',
      visitTypeLabel: () => 'Basal',
    });
    expect(row).toMatchObject({
      stratification_id: 'S00001',
      study_arm: 'standard',
      motivo_estratificacion: 4,
      score_total: null,
      nivel_cmo: null,
      regla_especial: null,
      incompleta: 1,
      n_desconocidas: 1,
      engine_version: 'e',
      cmo_tabaquismo: 9,
      cmo_naive_terapia: 1,
      cmo_edad_grupo: 3,
      inf_conservacion_especial: 0,
      cmo_falta_adherencia: null,
    });
    expect(Object.keys(row).filter((k) => k.startsWith('cmo_'))).toHaveLength(27);
  });

  it('diccionario SPSS en español para todas las variables codificadas', () => {
    const dict = stratificationSpssDictionary();
    expect(dict.variableLabels.cmo_tabaquismo).toBe('Tabaquismo');
    expect(dict.valueLabels.cmo_tabaquismo).toEqual({ '0': 'No', '1': 'Si', '9': 'Desconocido' });
    expect(dict.valueLabels.cmo_comorbilidades_cv_diabetes['2']).toBe('Tiene más de una');
    expect(dict.valueLabels.motivo_estratificacion['6']).toBe('Necesidad detectada');
    expect(dict.variableLabels.inf_conservacion_especial).toContain('no puntua');
  });
});
