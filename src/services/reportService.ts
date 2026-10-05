import { getVisitTypeLabel } from '../constants/enums';
import { THESIS_INSTITUTIONAL_REFERENCE } from '../constants/institutional';
import { normalizeMedicationDisplayName } from '../features/medications/displayFormat';
import { listVisitMedicationSnapshot } from '../features/medications/medicationsService';
import type { PatientMedication } from '../features/medications/types';
import { getCmoScoreByVisit } from './cmoScoreService';
import { listInterventionsByVisit, type Intervention } from './interventionService';
import { getPatientById } from './patientService';
import { listQuestionnairesByVisit, type QuestionnaireResponseRecord } from './questionnaireService';
import { formatQuestionnaireResult, validateQuestionnaireTrace } from './questionnaireDomain';
import { getVisitById, type Visit } from './visitService';

export type PatientVisitReportData = {
  visitId: string;
  patientLabel: string;
  visitTypeLabel: string;
  visitDateLabel: string;
  generatedAtLabel: string;
  simpleSummary: string;
  cmoLevelLabel: string;
  questionnaireResults: string[];
  interventions: string[];
  recommendations: string[];
  activeMedications: string[];
  followUp: string;
  institutionalFooter: string;
};

export type ClinicianVisitReportData = {
  visitId: string;
  patientLabel: string;
  visitTypeLabel: string;
  visitDateLabel: string;
  generatedAtLabel: string;
  cmoScoreLabel: string;
  relevantQuestionnaires: string[];
  interventions: string[];
  activeMedications: string[];
  clinicalSummary: string;
  careCoordinationRecommendations: string[];
  institutionalFooter: string;
};

export type VisitReportLoadResult = {
  patientReportData: PatientVisitReportData | null;
  clinicianReportData: ClinicianVisitReportData | null;
  errorMessage: string | null;
  missingFields: string[];
};

function toDateLabel(value: string | null): string {
  if (!value) return 'No disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-ES');
}

function toDateTimeLabel(value: Date): string {
  return value.toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cmoPriorityLabel(priority: number | null | undefined): string {
  if (priority === 1) return 'Nivel 1 · Prioridad alta';
  if (priority === 2) return 'Nivel 2 · Seguimiento estrecho';
  if (priority === 3) return 'Nivel 3 · Seguimiento rutinario';
  return 'No disponible';
}

function formatInterventionItem(item: Intervention): string {
  const chunks = [item.intervention_type];
  if (item.outcome?.trim()) chunks.push(`Resultado: ${item.outcome.trim()}`);
  if (item.notes?.trim()) chunks.push(`Notas: ${item.notes.trim()}`);
  return chunks.join(' · ');
}

function deriveSimpleSummary(visit: Visit, cmoScore: number | null, interventions: Intervention[], questionnaires: QuestionnaireResponseRecord[]): string {
  const chunks: string[] = [];
  if (cmoScore !== null) chunks.push(`Su prioridad CMO actual es ${cmoScore}`);
  if (interventions.length > 0) chunks.push(`En esta visita se registraron ${interventions.length} intervenciones farmacéuticas`);
  if (questionnaires.length > 0) chunks.push(`También se completaron ${questionnaires.length} cuestionarios de seguimiento`);
  if (visit.notes?.trim()) chunks.push(`Comentario del equipo clínico: ${visit.notes.trim()}`);
  return chunks.length > 0 ? `${chunks.join('. ')}.` : 'En esta visita no se registró información suficiente para ampliar el resumen.';
}

function deriveClinicalSummary(visit: Visit, cmoScore: number | null, questionnaires: QuestionnaireResponseRecord[]): string {
  return [
    `Priorización CMO: ${cmoScore !== null ? cmoScore : 'No disponible'}.`,
    `Cuestionarios con respuesta en la visita: ${questionnaires.length}.`,
    visit.notes?.trim() ? `Evolución clínica documentada: ${visit.notes.trim()}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function derivePatientRecommendations(interventions: Intervention[]): string[] {
  const items = interventions.map((item) => item.outcome?.trim()).filter((v): v is string => Boolean(v));
  if (items.length > 0) return items.slice(0, 4);
  return [
    'Mantenga la medicación según la pauta indicada y evite cambios por cuenta propia.',
    'Si presenta síntomas nuevos o efectos adversos, contacte con su centro de salud sin demora.',
    'Acuda a la próxima consulta con una lista actualizada de toda su medicación y horarios.',
  ];
}

function deriveCoordinationRecommendations(cmoPriority: number | null | undefined): string[] {
  if (cmoPriority === 1) {
    return ['Prioridad alta: coordinar revisión médica preferente en un plazo máximo de 7 días.', 'Revisar conciliación terapéutica y riesgo de eventos adversos antes del próximo contacto.'];
  }

  if (cmoPriority === 2) {
    return ['Mantener coordinación con atención primaria para ajustar el plan farmacoterapéutico.', 'Programar reevaluación de adherencia y control clínico en el siguiente contacto.'];
  }

  if (cmoPriority === 3) {
    return ['Continuar el circuito asistencial habitual con reevaluación periódica.', 'Sin alertas de alta prioridad; mantener monitorización en visita programada.'];
  }

  return ['No existe prioridad CMO registrada para emitir recomendaciones de coordinación específicas.'];
}

function buildMedicationDisplayName(item: PatientMedication): string {
  const preferredLabel = item.selected_label_snapshot?.trim() || item.medication_catalog?.display_name?.trim() || '';
  const normalizedName = normalizeMedicationDisplayName(preferredLabel);
  return normalizedName || 'Medicamento sin nombre';
}

function buildMedicationReportLine(item: PatientMedication): string {
  const fields = [item.dose_text?.trim(), item.frequency_text?.trim(), item.route_text?.trim(), item.notes?.trim()].filter((value): value is string => Boolean(value));

  if (fields.length === 0) {
    return buildMedicationDisplayName(item);
  }

  return `${buildMedicationDisplayName(item)} · ${fields.join(' · ')}`;
}

function mapActiveMedicationLines(items: PatientMedication[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const item of items) {
    const line = buildMedicationReportLine(item);
    const dedupeKey = line.toLocaleLowerCase('es-ES');
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    lines.push(line);
  }

  return lines;
}

function getInstitutionalFooter(): string {
  return [
    `IRIS · Proyecto de tesis doctoral: “${THESIS_INSTITUTIONAL_REFERENCE.projectTitle}”.`,
    `Doctoranda: ${THESIS_INSTITUTIONAL_REFERENCE.doctoralCandidate}.`,
    `Universidad: ${THESIS_INSTITUTIONAL_REFERENCE.university}.`,
    `Referencia institucional: ${THESIS_INSTITUTIONAL_REFERENCE.siceiaCode}.`,
  ].join(' ');
}

export async function loadVisitReportData(visitId: string): Promise<VisitReportLoadResult> {
  const visitResult = await getVisitById(visitId);
  if (visitResult.errorMessage || !visitResult.data) {
    return {
      patientReportData: null,
      clinicianReportData: null,
      errorMessage: visitResult.errorMessage ?? 'No se encontró la visita.',
      missingFields: ['visit'],
    };
  }

  const visit = visitResult.data;
  const [patientResult, cmoResult, interventionsResult, questionnairesResult, medicationSnapshotResult] = await Promise.all([
    getPatientById(visit.patient_id),
    getCmoScoreByVisit(visitId),
    listInterventionsByVisit(visitId),
    listQuestionnairesByVisit(visitId),
    listVisitMedicationSnapshot(visitId),
  ]);

  if (questionnairesResult.errorMessage) {
    return {
      patientReportData: null,
      clinicianReportData: null,
      errorMessage: `No se puede verificar la trazabilidad de los cuestionarios: ${questionnairesResult.errorMessage}`,
      missingFields: ['questionnaire_traceability'],
    };
  }

  const questionnaireTrace = validateQuestionnaireTrace(questionnairesResult.data ?? [], {
    visitId,
    patientId: visit.patient_id,
    visitType: visit.visit_type,
  });

  if (questionnaireTrace.errorMessage) {
    return {
      patientReportData: null,
      clinicianReportData: null,
      errorMessage: questionnaireTrace.errorMessage,
      missingFields: ['questionnaire_traceability'],
    };
  }

  const missingFields: string[] = [];
  if (!patientResult.data) missingFields.push('patient');
  if (!visit.visit_date && !visit.scheduled_date) missingFields.push('visit_date');
  if (!cmoResult.data) missingFields.push('cmo_score');
  if ((interventionsResult.data ?? []).length === 0) missingFields.push('interventions');
  if ((questionnairesResult.data ?? []).length === 0) missingFields.push('questionnaires');

  const patient = patientResult.data;
  const interventions = interventionsResult.data ?? [];
  const questionnaires = questionnaireTrace.data;
  const activeMedicationLines = mapActiveMedicationLines(medicationSnapshotResult.data ?? []);
  const cmoScore = cmoResult.data?.score ?? null;

  const visitTypeLabel = getVisitTypeLabel(visit.visit_type);
  const visitDateLabel = toDateLabel(visit.visit_date ?? visit.scheduled_date);
  const generatedAtLabel = toDateTimeLabel(new Date());
  const cmoLevel = cmoPriorityLabel(cmoResult.data?.priority);
  const patientLabel = patient?.study_code ? `Paciente ${patient.study_code}` : 'Paciente';
  const questionnaireResults = questionnaires.map(formatQuestionnaireResult);

  return {
    patientReportData: {
      visitId,
      patientLabel,
      visitTypeLabel: visitTypeLabel || 'No disponible',
      visitDateLabel,
      generatedAtLabel,
      simpleSummary: `${patientLabel}. ${deriveSimpleSummary(visit, cmoScore, interventions, questionnaires)}`,
      cmoLevelLabel: cmoLevel,
      questionnaireResults,
      interventions: interventions.map(formatInterventionItem),
      recommendations: derivePatientRecommendations(interventions),
      activeMedications: activeMedicationLines,
      followUp:
        'Plan de seguimiento: acudir a la próxima visita con la medicación actualizada. Si surgen dudas, olvida dosis o aparecen efectos adversos, contacte antes con su equipo de salud para ajustar el plan.',
      institutionalFooter: getInstitutionalFooter(),
    },
    clinicianReportData: {
      visitId,
      patientLabel,
      visitTypeLabel: visitTypeLabel || 'No disponible',
      visitDateLabel,
      generatedAtLabel,
      cmoScoreLabel: cmoResult.data ? `${cmoResult.data.score} puntos · ${cmoLevel}` : 'No disponible',
      relevantQuestionnaires: questionnaireResults,
      interventions: interventions.map(formatInterventionItem),
      activeMedications: activeMedicationLines,
      clinicalSummary: deriveClinicalSummary(visit, cmoScore, questionnaires),
      careCoordinationRecommendations: deriveCoordinationRecommendations(cmoResult.data?.priority),
      institutionalFooter: getInstitutionalFooter(),
    },
    errorMessage: patientResult.errorMessage ?? cmoResult.errorMessage ?? interventionsResult.errorMessage ?? questionnairesResult.errorMessage ?? medicationSnapshotResult.errorMessage ?? null,
    missingFields,
  };
}

type ReportTemplate = 'patient' | 'clinician';

type PdfTemplatePayload = PatientVisitReportData | ClinicianVisitReportData;

function normalizePdfText(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^ -~¡-ÿ]/g, ' ')
    .trimEnd();
}

function escapePdfString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapTextLine(text: string, maxChars: number): string[] {
  const clean = normalizePdfText(text);
  if (!clean) return [''];
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = words[0];

  for (const word of words.slice(1)) {
    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  lines.push(current);
  return lines;
}

function buildPdfLines(template: ReportTemplate, data: PdfTemplatePayload): string[] {
  if (template === 'patient') {
    const patient = data as PatientVisitReportData;
    return [
      'IRIS - INFORME DE VISITA (PACIENTE)',
      '',
      `ID de visita: ${patient.visitId}`,
      `${patient.patientLabel}`,
      `Tipo de visita: ${patient.visitTypeLabel}`,
      `Fecha de la visita: ${patient.visitDateLabel}`,
      `Generado el: ${patient.generatedAtLabel}`,
      '',
      'Resumen de la visita',
      patient.simpleSummary,
      '',
      `Nivel CMO: ${patient.cmoLevelLabel}`,
      '',
      'Resultados de cuestionarios de esta visita',
      ...(patient.questionnaireResults.length > 0 ? patient.questionnaireResults.map((item) => `- ${item}`) : ['- No se registraron cuestionarios en esta visita']),
      '',
      'Intervenciones registradas',
      ...(patient.interventions.length > 0 ? patient.interventions.map((item) => `- ${item}`) : ['- No disponibles']),
      '',
      'Recomendaciones para el paciente',
      ...(patient.recommendations.length > 0 ? patient.recommendations.map((item) => `- ${item}`) : ['- No disponibles']),
      '',
      ...(patient.activeMedications.length > 0 ? ['Medicación activa en el momento de la visita', ...patient.activeMedications.map((item) => `- ${item}`), ''] : []),
      'Seguimiento',
      patient.followUp,
      '',
      'Firma profesional',
      'María Romero Murillo',
      'Farmacéutica responsable de la visita',
      '',
      patient.institutionalFooter,
    ];
  }

  const clinician = data as ClinicianVisitReportData;
  return [
    'IRIS - INFORME DE VISITA (MÉDICO)',
    '',
    `ID de visita: ${clinician.visitId}`,
    `${clinician.patientLabel}`,
    `Tipo de visita: ${clinician.visitTypeLabel}`,
    `Fecha de la visita: ${clinician.visitDateLabel}`,
    `Generado el: ${clinician.generatedAtLabel}`,
    '',
    `Puntuación CMO: ${clinician.cmoScoreLabel}`,
    '',
    'Resumen clínico',
    clinician.clinicalSummary,
    '',
    'Cuestionarios relevantes',
    ...(clinician.relevantQuestionnaires.length > 0 ? clinician.relevantQuestionnaires.map((item) => `- ${item}`) : ['- No disponibles']),
    '',
    'Intervenciones registradas',
    ...(clinician.interventions.length > 0 ? clinician.interventions.map((item) => `- ${item}`) : ['- No disponibles']),
    '',
    ...(clinician.activeMedications.length > 0 ? ['Medicación activa en el momento de la visita', ...clinician.activeMedications.map((item) => `- ${item}`), ''] : []),
    'Recomendaciones de coordinación asistencial',
    ...(clinician.careCoordinationRecommendations.length > 0 ? clinician.careCoordinationRecommendations.map((item) => `- ${item}`) : ['- No disponibles']),
    '',
    'Firma profesional',
    'María Romero Murillo',
    'Farmacéutica responsable de la visita',
    '',
    clinician.institutionalFooter,
  ];
}

function encodeLatin1(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function composePdfDocument(lines: string[]): Uint8Array {
  const maxCharsPerLine = 96;
  const linesPerPage = 44;
  const wrappedLines = lines.flatMap((line) => wrapTextLine(line, maxCharsPerLine));
  const pages: string[][] = [];

  for (let i = 0; i < wrappedLines.length; i += linesPerPage) {
    pages.push(wrappedLines.slice(i, i + linesPerPage));
  }

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  let nextId = 4;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    pageObjectIds.push(nextId++);
    contentObjectIds.push(nextId++);
  }

  objects[catalogId] = `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`;
  objects[pagesId] = `${pagesId} 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>\nendobj\n`;
  objects[fontId] = `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;

  for (let index = 0; index < pages.length; index += 1) {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = contentObjectIds[index];
    const page = pages[index];

    const textOperations = ['BT', '/F1 11 Tf', '48 795 Td', '14 TL', ...page.map((line, lineIndex) => `${lineIndex === 0 ? '' : 'T* '}(${escapePdfString(line)}) Tj`), 'ET'].join('\n');

    const stream = `${textOperations}\n`;

    objects[pageObjectId] =
      `${pageObjectId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj\n`;
    objects[contentObjectId] = `${contentObjectId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`;
  }

  const orderedObjectIds = Array.from({ length: objects.length - 1 }, (_, index) => index + 1).filter((id) => Boolean(objects[id]));

  let output = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const id of orderedObjectIds) {
    offsets[id] = output.length;
    output += objects[id];
  }

  const xrefStart = output.length;
  const totalObjects = Math.max(...orderedObjectIds) + 1;
  output += `xref\n0 ${totalObjects}\n`;
  output += '0000000000 65535 f \n';

  for (let id = 1; id < totalObjects; id += 1) {
    const offset = offsets[id] ?? 0;
    output += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }

  output += `trailer\n<< /Size ${totalObjects} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return encodeLatin1(output);
}

function buildPdfBlob(template: ReportTemplate, data: PdfTemplatePayload): Blob {
  const lines = buildPdfLines(template, data);
  const bytes = composePdfDocument(lines);
  const blobBytes = new Uint8Array(Array.from(bytes));
  return new Blob([blobBytes], { type: 'application/pdf' });
}

function triggerPdfDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPatientVisitReportPdf(data: PatientVisitReportData): Promise<void> {
  const blob = buildPdfBlob('patient', data);
  triggerPdfDownload(blob, `informe-paciente-${data.visitId}.pdf`);
}

export async function downloadClinicianVisitReportPdf(data: ClinicianVisitReportData): Promise<void> {
  const blob = buildPdfBlob('clinician', data);
  triggerPdfDownload(blob, `informe-medico-${data.visitId}.pdf`);
}

export function openPrintableHtmlDocument(): never {
  throw new Error('La impresión HTML local fue retirada. Use la descarga PDF en navegador.');
}
