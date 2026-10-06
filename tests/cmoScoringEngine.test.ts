import { describe, expect, it } from 'vitest';

import { CMO_ANSWER_FIELDS, CMO_INFORMATIVE_FIELDS } from '../src/constants/cmoDermapexModel';
import {
  CMO_ENGINE_VERSION,
  CMO_MODEL_VERSION,
  CmoInputError,
  LEVEL_THRESHOLDS,
  isCmoEngineAvailable,
  scoreCmo,
  type CmoInput,
} from '../src/services/cmoScoringEngine';

// Todas las variables puntuables respondidas «No»/«ninguna» (0 puntos), edad adulta.
function allNo(age: number | null = 45): CmoInput {
  const answers: Record<string, string> = {};
  for (const f of CMO_ANSWER_FIELDS) answers[f.code] = f.valueType === 'select' ? 'ninguna' : 'no';
  return { age, answers, informative: { conservacion_especial: 'no' } };
}

function withYes(codes: string[], age: number | null = 45): CmoInput {
  const input = allNo(age);
  for (const code of codes) input.answers[code] = 'si';
  return input;
}

// Pesos de la fuente usados en los casos (ver docs/DERMAPEX_CMO_ENGINE.md §1).
// Edad adulta = 2 puntos de base.

describe('scoreCmo · estructura y versión', () => {
  it('motor disponible y versionado con el commit de la fuente', () => {
    expect(isCmoEngineAvailable()).toBe(true);
    expect(CMO_ENGINE_VERSION).toBe('cmo-dermapex-1.0.0+src.227e444');
    expect(CMO_MODEL_VERSION).toBe('cmo-derma-model-1.0.0+src.227e444');
    expect(scoreCmo(allNo()).engineVersion).toBe(CMO_ENGINE_VERSION);
  });

  it('umbrales exactos del encargo', () => {
    expect(LEVEL_THRESHOLDS).toEqual([
      { minScore: 31, level: 1 },
      { minScore: 18, level: 2 },
    ]);
  });

  it('27 variables puntuables (26 respondidas + edad) y 1 informativa por resultado', () => {
    const r = scoreCmo(allNo());
    expect(r.items.filter((i) => i.scored)).toHaveLength(27);
    expect(r.items.filter((i) => !i.scored)).toHaveLength(1);
    expect(CMO_ANSWER_FIELDS).toHaveLength(26);
    expect(CMO_INFORMATIVE_FIELDS.map((f) => f.code)).toEqual(['conservacion_especial']);
  });

  it('no incluye variables músculo-esqueléticas ni gastrointestinales', () => {
    const codes = scoreCmo(allNo()).items.map((i) => i.code);
    for (const code of ['discapacidad_funcional', 'dolor_presente', 'complicaciones_intestinales', 'problemas_nutricionales']) {
      expect(codes).not.toContain(code);
    }
  });
});

describe('scoreCmo · puntuación 0 y máxima', () => {
  it('puntuación 0 (edad desconocida, todo «No») → nivel 3, incompleto solo por la edad', () => {
    const r = scoreCmo(allNo(null));
    expect(r.totalScore).toBe(0);
    expect(r.level).toBe(3);
    expect(r.unknown).toEqual(['edad_grupo']);
    expect(r.incomplete).toBe(true);
  });

  it('mínimo con edad adulta = 2 → nivel 3 y completo', () => {
    const r = scoreCmo(allNo(30));
    expect(r.totalScore).toBe(2);
    expect(r.level).toBe(3);
    expect(r.incomplete).toBe(false);
  });

  it('máximo aritmético del subtipo dermatológico en adultos = 72 (DISC-1: la fuente declara 71)', () => {
    const input = allNo(50);
    for (const f of CMO_ANSWER_FIELDS) input.answers[f.code] = f.valueType === 'select' ? 'mas-una' : 'si';
    const r = scoreCmo(input);
    expect(r.totalScore).toBe(72);
    expect(r.blockScores.map((b) => [b.block, b.points])).toEqual([
      ['demografica', 10],
      ['sociosanitaria', 21],
      ['clinica', 14],
      ['farmacoterapeutica', 25],
      ['especifica', 2],
    ]);
    expect(r.level).toBe(1);
    expect(r.specialRuleApplied).toBe(true);
  });
});

describe('scoreCmo · umbrales 17/18 y 30/31', () => {
  // edad 2 + naive 4 + adherencia 4 + polimedicación 3 + interacciones 3 + RAM 3 = 19
  it('17 puntos → nivel 3', () => {
    // 2 + 4 + 4 + 3 + 3 + tabaquismo 2 - … → 2+4+4+3+2+2(medicamento_reciente) = 17
    const r = scoreCmo(withYes(['naive_terapia', 'falta_adherencia', 'polimedicacion', 'tabaquismo', 'medicamento_reciente']));
    expect(r.totalScore).toBe(17);
    expect(r.level).toBe(3);
  });

  it('18 puntos → nivel 2', () => {
    const r = scoreCmo(withYes(['naive_terapia', 'falta_adherencia', 'polimedicacion', 'tabaquismo', 'medicamento_reciente', 'sexo_mujer']));
    expect(r.totalScore).toBe(18);
    expect(r.level).toBe(2);
  });

  it('30 puntos → nivel 2', () => {
    // 2 + 4+4+3+3+3+3 (=20) + 3+3 (sociosanitarias) + 2 (comorbilidades_2mas) = 30
    const r = scoreCmo(withYes(['naive_terapia', 'falta_adherencia', 'polimedicacion', 'interacciones', 'reacciones_adversas', 'modificacion_regimen', 'alcoholismo_drogas', 'barreras_comunicacion', 'comorbilidades_2mas']));
    expect(r.totalScore).toBe(30);
    expect(r.level).toBe(2);
  });

  it('31 puntos → nivel 1 sin regla especial', () => {
    const r = scoreCmo(withYes(['naive_terapia', 'falta_adherencia', 'polimedicacion', 'interacciones', 'reacciones_adversas', 'modificacion_regimen', 'alcoholismo_drogas', 'barreras_comunicacion', 'comorbilidades_2mas', 'sexo_mujer']));
    expect(r.totalScore).toBe(31);
    expect(r.level).toBe(1);
    expect(r.specialRuleApplied).toBe(false);
  });
});

describe('scoreCmo · regla especial de embarazo', () => {
  it('embarazo con puntuación baja → nivel 1', () => {
    const r = scoreCmo(withYes(['sexo_mujer', 'embarazada']));
    expect(r.totalScore).toBe(6);
    expect(r.level).toBe(1);
    expect(r.specialRuleApplied).toBe(true);
  });

  it('deseo gestacional con puntuación baja → nivel 1', () => {
    const r = scoreCmo(withYes(['sexo_mujer', 'deseo_embarazo']));
    expect(r.totalScore).toBe(5);
    expect(r.level).toBe(1);
    expect(r.specialRuleApplied).toBe(true);
  });

  it('embarazo «desconocido» no activa la regla pero marca incompleto', () => {
    const input = withYes(['sexo_mujer']);
    input.answers.embarazada = 'unknown';
    const r = scoreCmo(input);
    expect(r.specialRuleApplied).toBe(false);
    expect(r.level).toBe(3);
    expect(r.unknown).toContain('embarazada');
    expect(r.incomplete).toBe(true);
  });

  it('embarazo «No» y deseo «No» → sin regla especial', () => {
    expect(scoreCmo(withYes(['sexo_mujer'])).specialRuleApplied).toBe(false);
  });
});

describe('scoreCmo · edad derivada', () => {
  it('18 años → banda 18-69 (2 puntos)', () => {
    const r = scoreCmo(allNo(18));
    expect(r.items.find((i) => i.code === 'edad_grupo')).toMatchObject({ rawValue: '18-69', points: 2, age: 18 });
  });

  it('69 años → banda 18-69 (2 puntos)', () => {
    expect(scoreCmo(allNo(69)).totalScore).toBe(2);
  });

  it('70 años → banda ≥70 (2 puntos)', () => {
    const r = scoreCmo(allNo(70));
    expect(r.items.find((i) => i.code === 'edad_grupo')).toMatchObject({ rawValue: '≥70', points: 2 });
    expect(r.totalScore).toBe(2);
  });

  it('95 años → banda ≥70 (2 puntos)', () => {
    expect(scoreCmo(allNo(95)).totalScore).toBe(2);
  });
});

describe('scoreCmo · comorbilidad cardiometabólica (específica dermatológica)', () => {
  it.each([
    ['ninguna', 0],
    ['una', 1],
    ['mas-una', 2],
  ])('%s → %i punto(s) en el bloque específico', (value, points) => {
    const input = allNo(40);
    input.answers.comorbilidades_cv_diabetes = value;
    const r = scoreCmo(input);
    expect(r.blockScores.find((b) => b.block === 'especifica')?.points).toBe(points);
    expect(r.totalScore).toBe(2 + points);
  });

  it('cardiometabólica desconocida → 0 puntos e incompleto', () => {
    const input = allNo(40);
    input.answers.comorbilidades_cv_diabetes = 'unknown';
    const r = scoreCmo(input);
    expect(r.totalScore).toBe(2);
    expect(r.unknown).toEqual(['comorbilidades_cv_diabetes']);
  });
});

describe('scoreCmo · desconocidos (D1) e informativa (D3)', () => {
  it('«desconocido» no puntúa y activa incomplete con la lista de variables', () => {
    const input = withYes(['naive_terapia']);
    input.answers.falta_adherencia = 'unknown';
    input.answers.tabaquismo = 'unknown';
    const r = scoreCmo(input);
    expect(r.totalScore).toBe(6);
    expect(r.incomplete).toBe(true);
    expect(r.unknown).toEqual(['tabaquismo', 'falta_adherencia']);
    expect(r.items.find((i) => i.code === 'falta_adherencia')).toMatchObject({ rawValue: 'unknown', points: 0 });
  });

  it('una clave ausente equivale a desconocido', () => {
    const r = scoreCmo({ age: 40, answers: {} });
    expect(r.unknown).toHaveLength(26);
    expect(r.totalScore).toBe(2);
    expect(r.informative).toEqual([{ code: 'conservacion_especial', label: 'Requisitos especiales de conservación', rawValue: 'unknown' }]);
  });

  it('la variable informativa no suma aunque sea «Sí»', () => {
    const a = scoreCmo(allNo(40));
    const input = allNo(40);
    input.informative = { conservacion_especial: 'si' };
    const b = scoreCmo(input);
    expect(b.totalScore).toBe(a.totalScore);
    expect(b.items.find((i) => i.code === 'conservacion_especial')).toMatchObject({ rawValue: 'si', points: 0, scored: false });
    expect(b.triggeredVariables.map((t) => t.code)).not.toContain('conservacion_especial');
  });

  it('la informativa desconocida no marca el resultado como incompleto', () => {
    const input = allNo(40);
    input.informative = {};
    expect(scoreCmo(input).incomplete).toBe(false);
  });
});

describe('scoreCmo · validación de entrada', () => {
  it('rechaza variables que no existen en el modelo', () => {
    expect(() => scoreCmo({ age: 40, answers: { dolor_presente: 'si' } })).toThrow(CmoInputError);
  });

  it('rechaza valores no admitidos', () => {
    expect(() => scoreCmo({ age: 40, answers: { tabaquismo: 'quizá' } })).toThrow(CmoInputError);
    expect(() => scoreCmo({ age: 40, answers: { comorbilidades_cv_diabetes: 'si' } })).toThrow(CmoInputError);
  });

  it('desglose: variables activadas con razón y puntos, ordenadas por puntos', () => {
    const r = scoreCmo(withYes(['tabaquismo', 'naive_terapia']));
    expect(r.triggeredVariables.map((t) => [t.code, t.points])).toEqual([
      ['naive_terapia', 4],
      ['edad_grupo', 2],
      ['tabaquismo', 2],
    ]);
    expect(r.triggeredVariables[0].rationale).toContain('4 punto(s)');
  });
});
