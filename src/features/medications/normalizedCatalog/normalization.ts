import type { BuildMedicationFingerprintInput } from './types';

function compactToken(value: string): string {
  return value.replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeText(text: string): string {
  return compactToken(
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase(),
  ).replace(/\s+/g, ' ');
}

export function buildMedicationFingerprint(input: BuildMedicationFingerprintInput): string {
  const ingredientBlock = input.ingredientNames
    .map(normalizeText)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join('+');

  const strengthText = normalizeText(input.strengthText ?? '');
  const pharmaceuticalForm = normalizeText(input.pharmaceuticalForm ?? '');
  const routeDefault = normalizeText(input.routeDefault ?? '');

  // Estructura estable para evitar fingerprints distintos con el mismo significado clínico.
  return [ingredientBlock, strengthText, pharmaceuticalForm, routeDefault].join('|');
}
