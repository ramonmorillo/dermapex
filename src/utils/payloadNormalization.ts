// Normalización de payloads guiada por esquema, extraída de assessmentService (IRIS) para
// reutilizarla en los futuros formularios clínicos de DERMAPEX. Es genérica: no contiene
// ninguna variable clínica. El esquema concreto de cada formulario se definirá con el protocolo.

export type PayloadFieldType = 'uuid' | 'enum' | 'numeric' | 'integer' | 'boolean' | 'text';

export type PayloadFieldSchema = {
  type: PayloadFieldType;
  values?: readonly string[];
};

export type PayloadSchema<K extends string> = Record<K, PayloadFieldSchema>;

const NULL_LIKE_VALUES = new Set(['', 'unknown', 'not_recorded', 'no registrado', 'desconocido']);

export function normalizeNullLike(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;

  const normalized = value.trim();
  if (NULL_LIKE_VALUES.has(normalized.toLowerCase())) return null;

  return normalized;
}

export function normalizeBoolean(value: unknown): boolean | null {
  const normalizedValue = normalizeNullLike(value);
  if (normalizedValue === null) return null;

  if (typeof normalizedValue === 'boolean') return normalizedValue;
  if (typeof normalizedValue === 'number') {
    if (normalizedValue === 1) return true;
    if (normalizedValue === 0) return false;
    return null;
  }
  if (typeof normalizedValue !== 'string') return null;

  const normalized = normalizedValue.toLowerCase();
  if (normalized === 'yes' || normalized === 'si' || normalized === 'sí' || normalized === 'true') return true;
  if (normalized === 'no' || normalized === 'false') return false;

  return null;
}

export function normalizeNumber(value: unknown, integer = false): number | null {
  const normalizedValue = normalizeNullLike(value);
  if (normalizedValue === null) return null;

  if (typeof normalizedValue === 'number' && Number.isFinite(normalizedValue)) {
    return integer ? Math.trunc(normalizedValue) : normalizedValue;
  }

  if (typeof normalizedValue !== 'string') return null;

  const numericValue = Number(normalizedValue);
  if (!Number.isFinite(numericValue)) return null;

  return integer ? Math.trunc(numericValue) : numericValue;
}

export function normalizeEnum(value: unknown, allowedValues: readonly string[]): string | null {
  const normalizedValue = normalizeNullLike(value);
  if (normalizedValue === null) return null;
  if (typeof normalizedValue !== 'string') return null;

  const lower = normalizedValue.toLowerCase();
  const mappedValue = lower === 'si' || lower === 'sí' || lower === 'true'
    ? 'yes'
    : lower === 'false'
      ? 'no'
      : lower;

  return allowedValues.includes(mappedValue) ? mappedValue : null;
}

/**
 * Devuelve un payload con exactamente las claves del esquema, cada valor normalizado a su tipo.
 * Los valores no válidos o "null-like" ('', 'unknown', 'desconocido'…) se convierten en null.
 */
export function normalizePayloadBySchema<K extends string>(
  schema: PayloadSchema<K>,
  payload: Partial<Record<K, unknown>>,
): Record<K, unknown> {
  const normalizedPayload: Partial<Record<K, unknown>> = {};

  for (const key of Object.keys(schema) as K[]) {
    const fieldSchema = schema[key];
    const rawValue = payload[key];

    switch (fieldSchema.type) {
      case 'boolean':
        normalizedPayload[key] = normalizeBoolean(rawValue);
        break;
      case 'numeric':
        normalizedPayload[key] = normalizeNumber(rawValue);
        break;
      case 'integer':
        normalizedPayload[key] = normalizeNumber(rawValue, true);
        break;
      case 'enum':
        normalizedPayload[key] = normalizeEnum(rawValue, fieldSchema.values ?? []);
        break;
      case 'uuid':
      case 'text': {
        const normalizedValue = normalizeNullLike(rawValue);
        normalizedPayload[key] = typeof normalizedValue === 'string' ? normalizedValue : null;
        break;
      }
      default:
        normalizedPayload[key] = null;
    }
  }

  return normalizedPayload as Record<K, unknown>;
}
