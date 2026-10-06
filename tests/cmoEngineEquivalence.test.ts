// Equivalencia del port TypeScript con el motor de la fuente (tests/reference/cmoinmunomediadas).
// La referencia solo se importa aquí: la aplicación nunca la usa.
import { describe, expect, it } from 'vitest';

// @ts-expect-error · módulo JS de referencia sin tipos
import { computeStratification } from './reference/cmoinmunomediadas/cmo-engine.js';
import { CMO_ANSWER_FIELDS } from '../src/constants/cmoDermapexModel';
import { scoreCmo, UNKNOWN, type CmoInput } from '../src/services/cmoScoringEngine';

type ReferenceResult = {
  total: number;
  level: 1 | 2 | 3;
  pregnancyTrigger: boolean;
  breakdown: Record<string, { points: number; max: number }>;
  contributingFactors: Array<{ id: string; points: number }>;
};

// En la fuente, una variable no confirmada simplemente no aparece en confirmedValues; la edad
// desconocida se pasa como undefined (ver DISC-3 sobre la edad vacía '').
function runReference(input: CmoInput): ReferenceResult {
  const confirmed: Record<string, string> = {};
  for (const [code, value] of Object.entries(input.answers)) {
    if (value && value !== UNKNOWN) confirmed[code] = value;
  }
  return computeStratification(confirmed, 'dermatologica', input.age ?? undefined) as ReferenceResult;
}

function expectEquivalent(input: CmoInput) {
  const ours = scoreCmo(input);
  const ref = runReference(input);
  expect(ours.totalScore).toBe(ref.total);
  expect(ours.level).toBe(ref.level);
  expect(ours.specialRuleApplied).toBe(ref.pregnancyTrigger);
  for (const block of ours.blockScores) {
    expect(block.points).toBe(ref.breakdown[block.block].points);
    expect(block.declaredMaxPoints).toBe(ref.breakdown[block.block].max);
  }
  expect(ours.triggeredVariables.map((t) => [t.code, t.points])).toEqual(ref.contributingFactors.map((f) => [f.id, f.points]));
}

// PRNG determinista (mulberry32) con semilla fija: los 500 casos son siempre los mismos.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRECTED_CASES: Array<[string, CmoInput]> = [
  ['vacío, edad 45', { age: 45, answers: {} }],
  ['edad desconocida', { age: null, answers: { tabaquismo: 'si' } }],
  ['18 años', { age: 18, answers: {} }],
  ['70 años', { age: 70, answers: {} }],
  ['embarazo puntuación baja', { age: 30, answers: { sexo_mujer: 'si', embarazada: 'si' } }],
  ['deseo gestacional', { age: 30, answers: { sexo_mujer: 'si', deseo_embarazo: 'si' } }],
  ['cardiometabólica una', { age: 50, answers: { comorbilidades_cv_diabetes: 'una' } }],
  ['cardiometabólica más de una', { age: 50, answers: { comorbilidades_cv_diabetes: 'mas-una' } }],
  ['17 puntos', { age: 40, answers: { naive_terapia: 'si', falta_adherencia: 'si', polimedicacion: 'si', tabaquismo: 'si', medicamento_reciente: 'si' } }],
  ['18 puntos', { age: 40, answers: { naive_terapia: 'si', falta_adherencia: 'si', polimedicacion: 'si', tabaquismo: 'si', medicamento_reciente: 'si', sexo_mujer: 'si' } }],
  ['30 puntos', { age: 40, answers: { naive_terapia: 'si', falta_adherencia: 'si', polimedicacion: 'si', interacciones: 'si', reacciones_adversas: 'si', modificacion_regimen: 'si', alcoholismo_drogas: 'si', barreras_comunicacion: 'si', comorbilidades_2mas: 'si' } }],
  ['31 puntos', { age: 40, answers: { naive_terapia: 'si', falta_adherencia: 'si', polimedicacion: 'si', interacciones: 'si', reacciones_adversas: 'si', modificacion_regimen: 'si', alcoholismo_drogas: 'si', barreras_comunicacion: 'si', comorbilidades_2mas: 'si', sexo_mujer: 'si' } }],
  ['máximo', { age: 50, answers: Object.fromEntries(CMO_ANSWER_FIELDS.map((f) => [f.code, f.valueType === 'select' ? 'mas-una' : 'si'])) }],
  ['todo desconocido', { age: 50, answers: Object.fromEntries(CMO_ANSWER_FIELDS.map((f) => [f.code, UNKNOWN])) }],
];

describe('equivalencia con cmoinmunomediadas (computeStratification, dermatológica)', () => {
  it.each(DIRECTED_CASES)('caso dirigido: %s', (_name, input) => {
    expectEquivalent(input);
  });

  it('500 combinaciones aleatorias con semilla fija dan idéntica puntuación, nivel y desglose', () => {
    const rand = mulberry32(20261006);
    let level1 = 0;
    let level2 = 0;
    let level3 = 0;
    let pregnancy = 0;
    for (let i = 0; i < 500; i++) {
      const answers: Record<string, string> = {};
      // Probabilidad de «Sí» variable por caso para cubrir los tres niveles.
      const pYes = rand() * 0.9;
      for (const field of CMO_ANSWER_FIELDS) {
        const r = rand();
        if (r < 0.12) answers[field.code] = UNKNOWN;
        else if (field.valueType === 'select') answers[field.code] = field.options[Math.floor(rand() * field.options.length)].value;
        else answers[field.code] = rand() < pYes ? 'si' : 'no';
      }
      // Embarazo poco frecuente para no saturar el nivel 1.
      if (rand() < 0.85) {
        answers.embarazada = 'no';
        answers.deseo_embarazo = rand() < 0.5 ? 'no' : UNKNOWN;
      }
      const age = rand() < 0.05 ? null : 18 + Math.floor(rand() * 80);
      const input: CmoInput = { age, answers, informative: { conservacion_especial: rand() < 0.5 ? 'si' : 'no' } };
      expectEquivalent(input);
      const r = scoreCmo(input);
      if (r.level === 1) level1++;
      if (r.level === 2) level2++;
      if (r.level === 3) level3++;
      if (r.specialRuleApplied) pregnancy++;
    }
    // La muestra aleatoria cubre los tres niveles y la regla especial.
    expect(level1).toBeGreaterThan(20);
    expect(level2).toBeGreaterThan(20);
    expect(level3).toBeGreaterThan(20);
    expect(pregnancy).toBeGreaterThan(10);
  });
});
