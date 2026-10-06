// Fidelidad de los DATOS del modelo con la fuente y con la semilla SQL de cmo_variable_catalog.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// @ts-expect-error · módulo JS de referencia sin tipos
import * as reference from './reference/cmoinmunomediadas/config.js';
import {
  AGE_GROUP_CODE,
  CMO_AGE_GROUPS,
  CMO_ANSWER_FIELDS,
  CMO_BLOCKS,
  CMO_INFORMATIVE_FIELDS,
  CMO_LEVEL_THRESHOLDS_SOURCE,
  CMO_MODEL_VERSION,
} from '../src/constants/cmoDermapexModel';
import { CMO_ENGINE_VERSION } from '../src/services/cmoScoringEngine';

const REFERENCE_DIR = resolve(__dirname, 'reference/cmoinmunomediadas');

type RefField = {
  id: string;
  block: string;
  type: string;
  label: string;
  definition: string;
  criteria: string;
  options: Array<{ value: string; label: string; weight: number }>;
  cmoDimension?: string;
  specialRule?: string;
};

describe('referencia congelada', () => {
  it.each([
    ['config.js', 'b85b3fba6aabb905e6d7e8acae1fc74d662c4106f42b52123142060802ab36ec'],
    ['cmo-engine.js', '27fd557ccac68bb4f0cc01b9b8eb3555f1ee5ca81970d73aa8dcf1285617ec31'],
    ['interventions-catalog.js', 'cf95b69bb1d45327548224dd947559ee28c257fce1dc0125a86705a35c93e4ca'],
  ])('%s conserva el SHA-256 registrado en REFERENCE.md', (file, sha) => {
    const digest = createHash('sha256').update(readFileSync(resolve(REFERENCE_DIR, file))).digest('hex');
    expect(digest).toBe(sha);
    expect(readFileSync(resolve(REFERENCE_DIR, 'REFERENCE.md'), 'utf8')).toContain(sha);
  });
});

describe('port de datos = config.js (subtipo dermatológico)', () => {
  const refFields = reference.fieldsForDiseaseType('dermatologica') as RefField[];

  it('mismas variables, en el mismo orden, con textos y pesos literales', () => {
    expect(CMO_ANSWER_FIELDS.map((f) => f.code)).toEqual(refFields.map((f) => f.id));
    CMO_ANSWER_FIELDS.forEach((field, index) => {
      const ref = refFields[index];
      expect(field.block).toBe(ref.block);
      expect(field.valueType).toBe(ref.type);
      expect(field.label).toBe(ref.label);
      expect(field.definition).toBe(ref.definition);
      expect(field.criteria).toBe(ref.criteria);
      expect(field.options).toEqual(ref.options.map((o) => ({ value: o.value, label: o.label, points: o.weight })));
      expect(field.cmoDimension).toBe(ref.cmoDimension ?? null);
      expect(field.specialRule).toBe(ref.specialRule ?? null);
    });
  });

  it('bloques, bandas de edad y umbrales literales', () => {
    expect(CMO_BLOCKS.map((b) => ({ id: b.id, label: b.label, maxPoints: b.declaredMaxPoints }))).toEqual(reference.BLOCKS);
    expect(CMO_AGE_GROUPS.map((g) => ({ value: g.value, label: g.label, weight: g.points, min: g.min, max: g.max }))).toEqual(reference.AGE_GROUPS);
    expect(CMO_LEVEL_THRESHOLDS_SOURCE).toEqual(reference.PRIORITY_THRESHOLDS);
  });
});

// La migración siembra cmo_variable_catalog desde un literal JSON delimitado por marcadores; aquí
// se comprueba que ese literal es exactamente el modelo TypeScript (una sola fuente de verdad).
describe('semilla SQL de cmo_variable_catalog = modelo TypeScript', () => {
  const sql = readFileSync(resolve(__dirname, '../supabase/migrations/20261006100100_dermapex_cmo_model.sql'), 'utf8');
  const match = sql.match(/-- BEGIN CMO_VARIABLES_JSON\n\$json\$(.*)\$json\$\n-- END CMO_VARIABLES_JSON/s);
  const seed = JSON.parse(match?.[1] ?? '[]') as Array<Record<string, unknown>>;

  it('28 filas: 27 puntuables + 1 informativa, con la versión de modelo y motor', () => {
    expect(seed).toHaveLength(28);
    expect(seed.filter((r) => r.is_scored)).toHaveLength(27);
    expect(sql).toContain(`'${CMO_MODEL_VERSION}'`);
    expect(sql).toContain(`'${CMO_ENGINE_VERSION}'`);
  });

  it('cada variable respondida coincide en bloque, tipo, etiqueta, criterio y opciones', () => {
    for (const field of CMO_ANSWER_FIELDS) {
      const row = seed.find((r) => r.variable_code === field.code);
      expect(row, field.code).toBeDefined();
      expect(row).toMatchObject({
        label: field.label,
        block: field.block,
        value_type: field.valueType,
        definition: field.definition,
        criteria: field.criteria,
        options: field.options,
        cmo_dimension: field.cmoDimension,
        special_rule: field.specialRule,
        is_scored: true,
      });
    }
  });

  it('edad derivada con las bandas de la fuente e informativa sin puntos', () => {
    expect(seed.find((r) => r.variable_code === AGE_GROUP_CODE)).toMatchObject({
      value_type: 'derived_age',
      options: CMO_AGE_GROUPS.map((g) => ({ value: g.value, label: g.label, points: g.points, min: g.min, max: g.max })),
      is_scored: true,
    });
    for (const field of CMO_INFORMATIVE_FIELDS) {
      expect(seed.find((r) => r.variable_code === field.code)).toMatchObject({
        block: 'informativa',
        is_scored: false,
        options: field.options.map((o) => ({ ...o, points: 0 })),
      });
    }
  });
});
