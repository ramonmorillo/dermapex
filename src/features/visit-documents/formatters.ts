export function formatDocumentSize(sizeInBytes: number): string {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes < 0) {
    return 'Tamaño no disponible';
  }

  const sizeUnits = ['B', 'KB', 'MB', 'GB'] as const;
  let value = sizeInBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < sizeUnits.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals = unitIndex === 0 ? 0 : 2;
  return `${value.toFixed(decimals)} ${sizeUnits[unitIndex]}`;
}

export function formatDocumentDate(dateIso: string, locale = 'es-ES'): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible';
  }

  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
