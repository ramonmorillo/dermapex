// Exportación de la base de investigación. El motor está en ./researchExport (lectura paginada y
// conciliada, conjuntos raw/LONG/WIDE/ítems, diccionario, CSV + sintaxis SPSS, Excel, JSON,
// manifiesto y verificación antes de entregar). Este módulo solo lo conecta con Supabase y el navegador.

import { supabase } from '../lib/supabase';
import { runResearchExport } from './researchExport/bundle';
import { SPANISH_EXCEL_DIALECT, STANDARD_DIALECT } from './researchExport/csv';
import { supabaseDataSource } from './researchExport/reader';

declare const __APP_VERSION__: string;

export type ExportFormat = 'standard' | 'spanish_excel';

type ExportOutcome = {
  success: boolean;
  errorMessage: string | null;
  generatedFiles: string[];
  summary?: string;
};

const USUAL_CARE_NO_INTERVENTION_CODE = 'sin-intervencion';

/** Actividades reales de la visita: excluye el marcador «Sin intervención» del listado estándar. */
export function countRealInterventions(interventions: Array<{ usual_care_code: string | null }>): number {
  return interventions.filter((row) => row.usual_care_code !== USUAL_CARE_NO_INTERVENTION_CODE).length;
}

/** Distingue «no registrado» de «sin intervención» (un hueco no es un cero). */
export function interventionRecordStatus(interventions: Array<{ usual_care_code: string | null }>): 'sin_registro' | 'sin_intervencion' | 'con_intervencion' {
  if (interventions.length === 0) return 'sin_registro';
  return countRealInterventions(interventions) === 0 ? 'sin_intervencion' : 'con_intervencion';
}

function downloadBinaryFile(fileName: string, data: Uint8Array, mime: string) {
  const blob = new Blob([Uint8Array.from(data)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportResearchDataBundle(format: ExportFormat = 'standard', onProgress?: (step: string) => void): Promise<ExportOutcome> {
  if (!supabase) {
    return { success: false, errorMessage: 'Supabase no está configurado. No se puede exportar.', generatedFiles: [] };
  }
  try {
    const { data: userData } = await supabase.auth.getUser();
    const bundle = await runResearchExport(
      supabaseDataSource(supabase),
      {
        dialect: format === 'spanish_excel' ? SPANISH_EXCEL_DIALECT : STANDARD_DIALECT,
        bom: true,
        appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'desconocida',
        userId: userData.user?.id ?? null,
      },
      onProgress,
    );
    downloadBinaryFile(bundle.fileName, bundle.zip, 'application/zip');
    const m = bundle.manifest;
    const issues = m.integrity.errors + m.integrity.to_review;
    return {
      success: true,
      errorMessage: null,
      generatedFiles: [bundle.fileName],
      summary: `${bundle.fileName}: ${m.scope.patients} pacientes, ${m.scope.visits} visitas, ${m.source_tables.length} tablas conciliadas con la base de datos y ${m.files.length} ficheros verificados.${issues > 0 ? ` ${issues} incidencias de integridad (ver analisis/incidencias_integridad.csv).` : ''}${m.warnings.length > 0 ? ` Avisos: ${m.warnings.join(' ')}` : ''}`,
    };
  } catch (error) {
    // Nunca se descarga un paquete parcial: cualquier fallo aborta la exportación entera.
    return { success: false, errorMessage: `Exportación cancelada, no se ha generado ningún fichero. ${(error as Error).message}`, generatedFiles: [] };
  }
}
