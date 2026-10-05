const UPPERCASE_MEDICATION_TOKENS = new Set(['EFG', 'EFP', 'HFA']);

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function capitalizeFirstLetter(value: string): string {
  return value.replace(/^([a-záéíóúñü])/u, (_, char: string) => char.toUpperCase());
}

export function normalizeMedicationDisplayName(value: string | null | undefined): string {
  const normalized = collapseWhitespace(value ?? '');
  if (!normalized) {
    return '';
  }

  const sentenceCase = capitalizeFirstLetter(normalized.toLocaleLowerCase('es-ES'));

  return sentenceCase.replace(/\b([a-záéíóúñü]{2,4})\b/giu, (token) => {
    const upperToken = token.toUpperCase();
    return UPPERCASE_MEDICATION_TOKENS.has(upperToken) ? upperToken : token;
  });
}
