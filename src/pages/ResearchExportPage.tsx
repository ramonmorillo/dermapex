// Exportación de la base de investigación DERMAPEX (pantalla equivalente a la de COAMO, #/export).
// El motor (lectura paginada y conciliada, conjuntos, diccionario, SPSS, Excel, JSON y manifiesto) está en
// services/researchExport. El ámbito lo decide la RLS: investigador → su(s) centro(s); coordinación → todos.

import { useEffect, useState } from 'react';

import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { exportResearchDataBundle, type ExportFormat } from '../services/exportService';
import { getCurrentProfile, type CurrentProfile } from '../services/profileService';
import { EXPORT_FORMAT_VERSION, type ExportManifest } from '../services/researchExport/bundle';
import { EXCLUDED_COLUMNS } from '../services/researchExport/datasets';

export function ResearchExportPage() {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [format, setFormat] = useState<ExportFormat>('standard');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [manifest, setManifest] = useState<ExportManifest | null>(null);

  useEffect(() => {
    void getCurrentProfile().then((r) => setProfile(r.data));
  }, []);

  const run = async () => {
    setExporting(true);
    setMessage(null);
    setManifest(null);
    const result = await exportResearchDataBundle(format, setProgress);
    setProgress(null);
    setExporting(false);
    setManifest(result.manifest ?? null);
    setMessage(result.success
      ? { tone: 'success', text: `Exportación completada y verificada. ${result.summary ?? ''}` }
      : { tone: 'danger', text: result.errorMessage ?? 'No se pudieron exportar los datos.' });
  };

  const isCoordinator = profile?.role === 'coordinator';
  const issues = manifest ? manifest.integrity.errors + manifest.integrity.to_review : 0;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="DERMAPEX · Investigación"
        title="Exportación de datos"
        description="Paquete completo de la base de investigación: tablas íntegras, formatos longitudinal y transversal, respuestas por ítem, diccionario de variables, CSV + sintaxis SPSS, Excel, JSON y manifiesto verificado."
      />

      <Notice tone="info" title={!profile ? 'Ámbito: según tu perfil' : isCoordinator ? 'Ámbito: todos los centros DERMAPEX (coordinación)' : 'Ámbito: tu(s) centro(s)'}>
        El servidor solo entrega los datos que tu perfil puede ver (control de acceso en la base de datos, RLS); no hay otros filtros.
        Los resultados CMO de la cohorte estándar solo se muestran a coordinación. Identificadores seudonimizados (study_code y UUID).
        Las fechas exactas y el centro pueden actuar como cuasiidentificadores y el paquete contiene texto libre (notas): custódialo
        según el plan de protección de datos del estudio.
      </Notice>

      <section className="card" aria-labelledby="research-export">
        <h2 id="research-export">Paquete de investigación (ZIP)</h2>
        <fieldset className="form-section">
          <legend>Formato de los CSV</legend>
          <div className="radio-row">
            <label className="radio-inline">
              <input type="radio" name="format" checked={format === 'standard'} onChange={() => setFormat('standard')} disabled={exporting} />
              Estándar (coma; decimal punto) · SPSS, R, Python, Stata
            </label>
            <label className="radio-inline">
              <input type="radio" name="format" checked={format === 'spanish_excel'} onChange={() => setFormat('spanish_excel')} disabled={exporting} />
              Excel España (punto y coma; decimal coma)
            </label>
          </div>
        </fieldset>
        <div className="form-actions">
          <button type="button" onClick={() => void run()} disabled={exporting}>{exporting ? 'Exportando...' : 'Exportar y descargar'}</button>
        </div>
        {progress ? <Notice tone="info">{progress}</Notice> : null}
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        {manifest && (issues > 0 || manifest.warnings.length > 0) ? (
          <Notice tone="warning" title="Revisar antes de analizar">
            {issues > 0 ? `${manifest.integrity.errors} errores y ${manifest.integrity.to_review} valores a revisar (analisis/incidencias_integridad.csv). ` : ''}
            {manifest.warnings.join(' ')}
          </Notice>
        ) : null}

        <ul className="help-text">
          <li>
            <strong>Completa y conciliada:</strong> cada tabla se lee por páginas con orden estable y se compara con el recuento exacto de la base
            de datos antes y después de leerla. Si faltan filas, se repiten o cambian durante la lectura, la exportación se cancela y no se descarga nada.
          </li>
          <li>
            <strong>Verificada antes de entregar:</strong> cada CSV se relee celda a celda y el ZIP se relee comprobando CRC y huellas SHA-256 (manifest.json).
          </li>
          <li>
            <strong>Contenido:</strong> raw/ (centros, pacientes, consentimientos, visitas, cuestionarios, intervenciones, tratamientos y sus cambios,
            documentos —solo metadatos—, estratificaciones CMO y catálogos de referencia); analisis/ (LONG: una fila por paciente y visita; WIDE: una
            fila por paciente con sufijos _v0, _v3, _v6, _v9, _v12; ítems de cuestionarios; estratificaciones codificadas; tratamientos vigentes por
            visita; incidencias de integridad); diccionario de variables; .sps por fichero; Excel (una hoja por conjunto) y JSON.
          </li>
          <li>Ausente = celda vacía, nunca 0 ni −999. Las estratificaciones son las guardadas por la base de datos (no se recalculan al exportar).</li>
          <li>Formato {EXPORT_FORMAT_VERSION}. La descarga se genera en el navegador y no queda registrada en la auditoría (limitación conocida).</li>
        </ul>

        <details>
          <summary>Datos que no se exportan y motivo</summary>
          <ul className="help-text">
            {EXCLUDED_COLUMNS.map((e) => (
              <li key={e.table}><code>{e.table}</code>: {e.columns}. {e.reason}</li>
            ))}
          </ul>
        </details>
      </section>

      {manifest ? (
        <section className="card" aria-labelledby="export-reconciliation">
          <h2 id="export-reconciliation">Control de integridad de la última exportación</h2>
          <p className="help-text">
            {manifest.scope.description} Centros: {manifest.scope.centers.join(', ') || '—'} · {manifest.scope.patients} pacientes ·{' '}
            {manifest.scope.visits} visitas · id {manifest.export_id}.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Tabla de origen</th><th>Registros accesibles (BD)</th><th>Exportados</th><th>Páginas</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {manifest.source_tables.map((t) => (
                  <tr key={t.table}>
                    <td><code>{t.table}</code></td>
                    <td>{t.db_count}</td>
                    <td>{t.exported_rows}</td>
                    <td>{t.pages}</td>
                    <td>{t.ok ? <StatusBadge tone="positive">Coincide</StatusBadge> : <StatusBadge tone="danger">Discrepancia</StatusBadge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Conjuntos generados ({manifest.datasets.length})</summary>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fichero</th><th>Unidad de análisis (una fila =)</th><th>Filas</th><th>Variables</th></tr></thead>
                <tbody>
                  {manifest.datasets.map((d) => (
                    <tr key={d.id}><td><code>{d.folder}/{d.id}.csv</code></td><td>{d.grain}</td><td>{d.rows}</td><td>{d.columns}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
