import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { DistributionBar } from '../components/ui/DistributionBar';
import { LoadingState } from '../components/ui/LoadingState';
import { MetricCard, MetricGrid } from '../components/ui/MetricCard';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { SectionHeader } from '../components/ui/SectionHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { TrendDelta } from '../components/ui/TrendDelta';
import { CMO_LEVEL_META } from '../constants/cmoLevels';
import { getVisitTypeLabel } from '../constants/enums';
import { loadDashboardData, type DashboardData } from '../services/dashboardService';
import { exportThesisDataCsvBundle } from '../services/exportService';

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const result = await loadDashboardData();
      setData(result.data);
      setErrorMessage(result.errorMessage);
      setLoading(false);
    }

    void loadData();
  }, []);

  if (loading) return <LoadingState label="Cargando dashboard..." />;
  if (errorMessage || !data) return <ErrorState title="No se pudo cargar el dashboard" message={errorMessage ?? 'Sin datos'} />;

  const pct = (value: number) => `${value.toFixed(1)}%`;

  const handleExportData = async () => {
    setExporting(true);
    setExportMessage(null);
    setExportError(null);

    const result = await exportThesisDataCsvBundle();

    if (!result.success) {
      setExportError(result.errorMessage ?? 'No se pudieron exportar los datos.');
      setExporting(false);
      return;
    }

    setExportMessage(`Exportación completada: ${result.generatedFiles.join(', ')}`);
    setExporting(false);
  };

  const { cohort, followup, clinicalEvolution, pharmaceuticalActivity } = data.pro;
  const stratifiedPatients = data.patientsByPriority[1] + data.patientsByPriority[2] + data.patientsByPriority[3];
  const unstratifiedPatients = Math.max(cohort.totalPatients - stratifiedPatients, 0);
  const evolution = data.patientEvolutionVsBaseline;
  const evaluablePatients = evolution.improved + evolution.stable + evolution.worsened;
  const hasPairedScores = clinicalEvolution.averageBaselineScore > 0 && clinicalEvolution.averageLatestScore > 0;
  const scoreDelta = hasPairedScores ? clinicalEvolution.averageLatestScore - clinicalEvolution.averageBaselineScore : null;
  const pillarRows = [
    { key: 'capacidad', label: 'Capacidad', value: pharmaceuticalActivity.interventionsByPillar.capacidad },
    { key: 'motivacion', label: 'Motivación', value: pharmaceuticalActivity.interventionsByPillar.motivacion },
    { key: 'oportunidad', label: 'Oportunidad', value: pharmaceuticalActivity.interventionsByPillar.oportunidad },
  ];
  const levelRows = [
    { key: 'n1', label: CMO_LEVEL_META[1].label, value: pharmaceuticalActivity.interventionsByLevel[1] },
    { key: 'n2', label: CMO_LEVEL_META[2].label, value: pharmaceuticalActivity.interventionsByLevel[2] },
    { key: 'n3', label: CMO_LEVEL_META[3].label, value: pharmaceuticalActivity.interventionsByLevel[3] },
  ];
  const maxBar = (rows: Array<{ value: number }>) => Math.max(1, ...rows.map((row) => row.value));
  const visitStages = [
    { key: 'baseline', label: 'Basal', value: followup.baselineVisits },
    { key: 'm3', label: '3 meses', value: followup.month3Visits },
    { key: 'm6', label: '6 meses', value: followup.month6Visits },
  ];
  const dq = data.dataQuality;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="IRIS Insights"
        title="Dashboard clínico"
        description="Panel operativo y estratégico para seguimiento poblacional de riesgo cardiovascular."
        actions={
          <button
            type="button"
            className="button-secondary"
            onClick={handleExportData}
            disabled={exporting}
            title="Genera archivos anonimizados: CSV (UTF-8), Excel (.xlsx), SPSS binario (.sav) y sintaxis .sps para importación reproducible."
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path d="M8 2v8m0 0L5 7m3 3 3-3M3 12.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {exporting ? 'Exportando...' : 'Exportar datos'}
          </button>
        }
      >
        {exportMessage ? <Notice tone="success">{exportMessage}</Notice> : null}
        {exportError ? <Notice tone="danger">{exportError}</Notice> : null}
      </PageHeader>

      <section className="card" aria-labelledby="dash-cohort">
        <SectionHeader id="dash-cohort" title="Cohorte" description="Nivel CMO actual = última estratificación registrada de cada paciente." />
        <MetricGrid columns={3}>
          <MetricCard size="lg" label="Pacientes incluidos" value={cohort.totalPatients} />
          <MetricCard size="lg" label="Edad media" value={cohort.averageAge.toFixed(1)} unit="años" />
          <MetricCard size="lg" label="Mujeres" value={cohort.womenPercentage.toFixed(1)} unit="%" />
        </MetricGrid>
        <div className="section-block dashboard-subsection">
          <h3>Distribución por nivel CMO</h3>
          <DistributionBar
            total={cohort.totalPatients}
            ariaLabel={`Nivel 1: ${pct(cohort.levelPercentage[1])}, Nivel 2: ${pct(cohort.levelPercentage[2])}, Nivel 3: ${pct(cohort.levelPercentage[3])}`}
            segments={[
              { key: 'n1', label: `${CMO_LEVEL_META[1].label}`, value: data.patientsByPriority[1], className: 'seg-cmo-1' },
              { key: 'n2', label: `${CMO_LEVEL_META[2].label}`, value: data.patientsByPriority[2], className: 'seg-cmo-2' },
              { key: 'n3', label: `${CMO_LEVEL_META[3].label}`, value: data.patientsByPriority[3], className: 'seg-cmo-3' },
              ...(unstratifiedPatients > 0
                ? [{ key: 'none', label: 'Sin estratificar', value: unstratifiedPatients, className: 'seg-none' }]
                : []),
            ]}
          />
          <p className="help-text dashboard-footnote">Porcentajes sobre el total de pacientes incluidos. Nivel 1 = mayor complejidad.</p>
        </div>
      </section>

      <div className="split-grid">
        <section className="card" aria-labelledby="dash-followup">
          <SectionHeader id="dash-followup" title="Seguimiento" description="Visitas registradas por punto temporal del protocolo." />
          <ul className="bar-list">
            {visitStages.map((stage) => (
              <li key={stage.key}>
                <span className="bar-list-label">{stage.label}</span>
                <span className="bar-list-track">
                  <span className="bar-list-fill" style={{ width: `${(stage.value / maxBar(visitStages)) * 100}%` }} />
                </span>
                <span className="bar-list-value">{stage.value}</span>
              </li>
            ))}
          </ul>
          <dl className="inline-facts">
            <div>
              <dt>Extraordinarias</dt>
              <dd>{followup.extraordinaryVisits}</dd>
            </div>
            <div>
              <dt>Sin seguimiento &gt;90 días</dt>
              <dd>
                {followup.patientsWithoutFollowup90d > 0 ? (
                  <StatusBadge tone="warning" dot>
                    {followup.patientsWithoutFollowup90d} {followup.patientsWithoutFollowup90d === 1 ? 'paciente' : 'pacientes'}
                  </StatusBadge>
                ) : (
                  <span className="text-muted">0 · sin pendientes</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="card" aria-labelledby="dash-evolution">
          <SectionHeader
            id="dash-evolution"
            title="Evolución clínica"
            description="Cambio de nivel CMO entre la visita basal y el último seguimiento estratificado."
          />
          {evaluablePatients === 0 ? (
            <p className="empty-inline">Aún no hay pacientes con estratificación basal y de seguimiento para comparar.</p>
          ) : (
            <DistributionBar
              total={evaluablePatients}
              ariaLabel={`Mejoran nivel: ${evolution.improved}, estables: ${evolution.stable}, empeoran: ${evolution.worsened}`}
              segments={[
                { key: 'improved', label: 'Mejoran nivel', value: evolution.improved, className: 'seg-improved' },
                { key: 'stable', label: 'Estables', value: evolution.stable, className: 'seg-stable' },
                { key: 'worsened', label: 'Empeoran', value: evolution.worsened, className: 'seg-worsened' },
              ]}
            />
          )}
          <dl className="inline-facts">
            <div>
              <dt>Score medio basal</dt>
              <dd className="numeric">{clinicalEvolution.averageBaselineScore.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Score medio última visita</dt>
              <dd className="numeric">{clinicalEvolution.averageLatestScore.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Diferencia</dt>
              <dd>
                <TrendDelta value={scoreDelta} decimals={2} favorable="lower" />
              </dd>
            </div>
          </dl>
          <p className="help-text dashboard-footnote">
            Mejorar = pasar a un nivel de menor complejidad (p. ej. N1 → N2). Las medias de score se calculan sobre conjuntos de
            pacientes no necesariamente idénticos; la diferencia es descriptiva, no pareada.
          </p>
        </section>
      </div>

      <section className="card" aria-labelledby="dash-activity">
        <SectionHeader id="dash-activity" title="Actividad farmacéutica" />
        <div className="split-grid">
          <MetricGrid>
            <MetricCard label="Intervenciones totales" value={pharmaceuticalActivity.totalInterventions} />
            <MetricCard label="Media por paciente" value={pharmaceuticalActivity.avgInterventionsPerPatient} />
          </MetricGrid>
          <div>
            <h3>Por pilar CMO</h3>
            <ul className="bar-list">
              {pillarRows.map((row) => (
                <li key={row.key}>
                  <span className="bar-list-label">{row.label}</span>
                  <span className="bar-list-track">
                    <span className="bar-list-fill" style={{ width: `${(row.value / maxBar(pillarRows)) * 100}%` }} />
                  </span>
                  <span className="bar-list-value">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Por nivel CMO vinculado</h3>
            <ul className="bar-list">
              {levelRows.map((row) => (
                <li key={row.key}>
                  <span className="bar-list-label">{row.label}</span>
                  <span className="bar-list-track">
                    <span className="bar-list-fill" style={{ width: `${(row.value / maxBar(levelRows)) * 100}%` }} />
                  </span>
                  <span className="bar-list-value">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="split-grid split-grid-3">
        <section className="card" aria-labelledby="dash-upcoming">
          <SectionHeader id="dash-upcoming" title="Próximas visitas programadas" />
          {data.upcomingVisits.length === 0 ? (
            <p className="empty-inline">No hay visitas futuras registradas.</p>
          ) : (
            <ul className="activity-list">
              {data.upcomingVisits.map((visit) => (
                <li key={visit.id}>
                  <span className="activity-date">{visit.scheduled_date ?? '-'}</span>
                  <span className="activity-main">{getVisitTypeLabel(visit.visit_type)}</span>
                  <Link to={`/patients/${visit.patient_id}`}>{visit.study_code ?? 'Paciente'}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="dash-recent">
          <SectionHeader id="dash-recent" title="Últimas visitas registradas" />
          {data.recentVisits.length === 0 ? (
            <p className="empty-inline">Aún no se han registrado visitas con fecha de realización.</p>
          ) : (
            <ul className="activity-list">
              {data.recentVisits.map((visit) => (
                <li key={visit.id}>
                  <span className="activity-date">{visit.visit_date ?? '-'}</span>
                  <span className="activity-main">{getVisitTypeLabel(visit.visit_type)}</span>
                  <Link to={`/patients/${visit.patient_id}`}>{visit.study_code ?? 'Paciente'}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="dash-interventions">
          <SectionHeader id="dash-interventions" title="Intervenciones recientes" />
          {data.recentInterventions.length === 0 ? (
            <p className="empty-inline">Registra intervenciones desde la ficha de visita.</p>
          ) : (
            <ul className="activity-list">
              {data.recentInterventions.map((item) => (
                <li key={item.id}>
                  <span className="activity-date">{item.created_at?.slice(0, 10) ?? '-'}</span>
                  <span className="activity-main" title={item.intervention_type}>{item.intervention_type}</span>
                  <Link to={`/patients/${item.patient_id}`}>Paciente</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="dash-quality">
        <SectionHeader
          id="dash-quality"
          title="Calidad de datos"
          description="Indicadores de completitud del registro. Se resaltan solo cuando requieren acción."
        />
        <MetricGrid columns={4}>
          <MetricCard
            label="Pacientes sin estratificación basal"
            value={dq.patientsWithoutBaselineStratification}
            tone={dq.patientsWithoutBaselineStratification > 0 ? 'warning' : 'default'}
          />
          <MetricCard label="Visitas sin score" value={dq.visitsWithoutScore} />
          <MetricCard label="Visitas sin intervenciones" value={dq.visitsWithoutInterventions} />
          <MetricCard
            label="Pacientes nivel 1 sin intervención"
            value={dq.level1PatientsWithoutIntervention}
            tone={dq.level1PatientsWithoutIntervention > 0 ? 'warning' : 'default'}
          />
        </MetricGrid>
        {data.kpiFallbackNotes.length > 0 && (
          <ul className="help-text dashboard-notes">
            {data.kpiFallbackNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}

        <div className="section-block dashboard-subsection">
          <h3>Score medio por tipo de visita</h3>
          {data.averageScoreByVisitType.length === 0 ? (
            <p className="empty-inline">Sin scores registrados. Registra una visita con score CMO para visualizar este análisis.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tipo de visita</th>
                    <th className="num">Score medio</th>
                    <th className="num">Visitas con score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.averageScoreByVisitType.map((item) => (
                    <tr key={item.visitType ?? 'unknown'}>
                      <td>{getVisitTypeLabel(item.visitType)}</td>
                      <td className="num strong">{item.averageScore.toFixed(2)}</td>
                      <td className="num">{item.visitsWithScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
