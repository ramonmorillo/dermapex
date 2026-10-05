import type { MedicationCatalogItem, MedicationCatalogSource, MedicationOrigin } from './types';

const KNOWN_SOURCES: ReadonlySet<MedicationCatalogSource> = new Set(['internal', 'manual', 'external_cima', 'external_other']);

export function normalizeMedicationCatalogSource(source: string | null | undefined): MedicationCatalogSource {
  const normalized = (source ?? '').trim().toLowerCase();

  if (!normalized) {
    return 'internal';
  }

  if (KNOWN_SOURCES.has(normalized as MedicationCatalogSource)) {
    return normalized as MedicationCatalogSource;
  }

  if (normalized.includes('cima')) {
    return 'external_cima';
  }

  return 'external_other';
}

export function resolveMedicationOrigin(item: Pick<MedicationCatalogItem, 'source' | 'source_code'>): MedicationOrigin {
  if (item.source === 'internal' || item.source === 'manual') {
    return { kind: 'internal', source: item.source };
  }

  return {
    kind: 'external',
    source: item.source,
    source_code: item.source_code,
  };
}
