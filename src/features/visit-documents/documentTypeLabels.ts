import type { VisitDocumentType } from './types';

export const DOCUMENT_TYPE_LABELS: Record<VisitDocumentType, string> = {
  lab_report: 'Informe de laboratorio',
  ecg: 'Electrocardiograma',
  hospital_discharge: 'Alta hospitalaria',
  specialist_report: 'Informe de especialista',
  imaging: 'Prueba de imagen',
  map: 'MAPA',
  prescription: 'Receta médica',
  other: 'Otro documento',
};

export function getVisitDocumentTypeLabel(documentType: VisitDocumentType): string {
  return DOCUMENT_TYPE_LABELS[documentType];
}
