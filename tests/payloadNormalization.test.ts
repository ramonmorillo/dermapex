import { describe, expect, it } from 'vitest';

import { normalizePayloadBySchema } from '../src/utils/payloadNormalization';

describe('normalizePayloadBySchema', () => {
  const schema = {
    visit_id: { type: 'uuid' },
    flag: { type: 'enum', values: ['yes', 'no', 'unknown'] },
    count: { type: 'integer' },
    value: { type: 'numeric' },
    active: { type: 'boolean' },
    note: { type: 'text' },
  } as const;

  it('normaliza cada campo a su tipo y descarta claves fuera del esquema', () => {
    const result = normalizePayloadBySchema(schema, {
      visit_id: ' abc ',
      flag: 'Sí',
      count: '4.9',
      value: '12.5',
      active: 'no',
      note: '  texto  ',
      ...({ extra: 'x' } as Record<string, unknown>),
    });

    expect(result).toEqual({ visit_id: 'abc', flag: 'yes', count: 4, value: 12.5, active: false, note: 'texto' });
  });

  it('convierte valores null-like y no válidos en null', () => {
    const result = normalizePayloadBySchema(schema, {
      visit_id: '',
      flag: 'quizá',
      count: 'abc',
      value: 'desconocido',
      active: 'unknown',
    });

    expect(result).toEqual({ visit_id: null, flag: null, count: null, value: null, active: null, note: null });
  });
});
