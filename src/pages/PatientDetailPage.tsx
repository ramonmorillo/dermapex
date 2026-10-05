import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { CmoLevelBadge } from '../components/ui/CmoLevelBadge';
import { LoadingState } from '../components/ui/LoadingState';
import { MetricCard, MetricGrid } from '../components/ui/MetricCard';
import { Notice } from '../components/ui/Notice';
import { PatientHeader } from '../components/ui/PatientHeader';
import { ScoreTrendChart } from '../components/ui/ScoreTrendChart';
import { SectionHeader } from '../components/ui/SectionHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { TrendDelta } from '../components/ui/TrendDelta';
import { VisitTimeline } from '../components/ui/VisitTimeline';
import { BaselineTrendPanel } from '../features/baseline-trend/BaselineTrendPanel';
import {
  VISIT_STATUS_OPTIONS,
  getSexLabel,
  getVisitStatusLabel,
  getVisitTypeLabel,
  getVisitTypeSortOrder,
  type VisitStatus,
} from '../constants/enums';
import { listClinicalAssessmentsByPatient, type ClinicalAssessmentHistoryEntry } from '../services/assessmentService';
import { PatientMedicationSummary } from '../features/medications/PatientMedicationSummary';
import { getLatestMedicationReviewDate, listActivePatientMedications } from '../features/medications/medicationsService';
import type { PatientMedication } from '../features/medications/types';
import { getLatestCmoScoreByPatient, listCmoScoresByPatient, type CmoScoreHistoryEntry, type CmoScoreRecord } from '../services/cmoScoreService';
import { listInterventionsByPatient, type PriorityLevel } from '../services/interventionService';
import { getPatientById, type Patient } from '../services/patientService';
import { getQuestionnairesByPatient, isQuestionnaireVisitType, type QuestionnaireResponseRecord } from '../services/questionnaireService';
import { listVisitsByPatient, updateVisit, type Visit } from '../services/visitService';
import { getFollowupStatus } from '../utils/followupStatus';

const REQUIRED_QUESTIONNAIRES = ['iexpac', 'morisky', 'eq5d'] as const;

const PRIORITY_LEVEL_LABEL: Record<PriorityLevel, string> = {
  high: '1 · Prioridad',
  medium: '2 · Intermedio',
  low: '3 · Basal',
};

function toSortTs(dateLike: string | null): number {
  return dateLike ? new Date(dateLike).getTime() : Number.MAX_SAFE_INTEGER;
}

function compareVisitsTimeline(a: Visit, b: Visit): number {
  const byDate = toSortTs(a.visit_date ?? a.scheduled_date) - toSortTs(b.visit_date ?? b.scheduled_date);
  if (byDate !== 0) return byDate;

  const byVisitNumber = (a.visit_number ?? Number.MAX_SAFE_INTEGER) - (b.visit_number ?? Number.MAX_SAFE_INTEGER);
  if (byVisitNumber !== 0) return byVisitNumber;

  const byVisitType = getVisitTypeSortOrder(a.visit_type) - getVisitTypeSortOrder(b.visit_type);
  if (byVisitType !== 0) return byVisitType;

  return (a.created_at ?? '').localeCompare(b.created_at ?? '');
}

function compareCmoDesc(a: CmoScoreHistoryEntry, b: CmoScoreHistoryEntry): number {
  const byDate = toSortTs(b.visit_date ?? b.scheduled_date) - toSortTs(a.visit_date ?? a.scheduled_date);
  if (byDate !== 0) return byDate;

  const byVisit = (b.visit_number ?? Number.NEGATIVE_INFINITY) - (a.visit_number ?? Number.NEGATIVE_INFINITY);
  if (byVisit !== 0) return byVisit;

  return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
}

function isBaselineVisit(visitType: string | null): boolean {
  return visitType === 'baseline';
}

function isFinalVisit(visitType: string | null): boolean {
  return visitType === 'final' || visitType === 'month_12';
}

function isVisitQuestionnaireComplete(visitId: string, responseSetByVisitId: Map<string, Set<string>>): boolean {
  const completed = responseSetByVisitId.get(visitId) ?? new Set<string>();
  return REQUIRED_QUESTIONNAIRES.every((questionnaire) => completed.has(questionnaire));
}

function getLatestVisitByType(visits: Visit[], selector: (visitType: string | null) => boolean): Visit | null {
  const filtered = [...visits]
    .filter((visit) => selector(visit.visit_type))
    .sort(compareVisitsTimeline);

  return filtered.length > 0 ? filtered[filtered.length - 1] : null;
}

function getQuestionnaireByVisit(
  responsesByVisitId: Map<string, Map<string, QuestionnaireResponseRecord>>,
  visitId: string | null,
  questionnaireType: string,
): QuestionnaireResponseRecord | null {
  if (!visitId) return null;
  return responsesByVisitId.get(visitId)?.get(questionnaireType) ?? null;
}

function toNullableNumber(value: number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function PatientDetailPage() {
  const { id = '' } = useParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [latestCmoScore, setLatestCmoScore] = useState<CmoScoreRecord | null>(null);
  const [cmoHistory, setCmoHistory] = useState<CmoScoreHistoryEntry[]>([]);
  const [assessmentHistory, setAssessmentHistory] = useState<ClinicalAssessmentHistoryEntry[]>([]);
  const [assessmentHistoryWarning, setAssessmentHistoryWarning] = useState<string | null>(null);
  const [interventions, setInterventions] = useState<Array<{ id: string; visit_id: string; intervention_type: string; priority_level: PriorityLevel | null }>>([]);
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireResponseRecord[]>([]);
  const [activeMedications, setActiveMedications] = useState<PatientMedication[]>([]);
  const [latestMedicationReviewDate, setLatestMedicationReviewDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [questionnaireWarning, setQuestionnaireWarning] = useState<string | null>(null);
  const [medicationWarning, setMedicationWarning] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setErrorMessage(null);
        setQuestionnaireWarning(null);
        setMedicationWarning(null);
        setAssessmentHistoryWarning(null);

        const [patientResult, visitsResult] = await Promise.all([getPatientById(id), listVisitsByPatient(id)]);

        if (patientResult.errorMessage || visitsResult.errorMessage) {
          setErrorMessage(patientResult.errorMessage ?? visitsResult.errorMessage ?? 'No se pudo cargar la ficha.');
          setLoading(false);
          return;
        }

        setPatient(patientResult.data);
        setVisits(visitsResult.data);

        const [
          cmoResult,
          cmoHistoryResult,
          assessmentHistoryResult,
          interventionsResult,
          questionnairesResult,
          medicationsResult,
          latestMedicationReviewResult,
        ] = await Promise.allSettled([
          getLatestCmoScoreByPatient(id),
          listCmoScoresByPatient(id),
          listClinicalAssessmentsByPatient(id),
          listInterventionsByPatient(id),
          getQuestionnairesByPatient(id),
          listActivePatientMedications(id),
          getLatestMedicationReviewDate(id),
        ]);

        if (cmoResult.status === 'fulfilled') {
          setLatestCmoScore(cmoResult.value.data);
        } else {
          setLatestCmoScore(null);
        }

        if (cmoHistoryResult.status === 'fulfilled') {
          setCmoHistory(cmoHistoryResult.value.data);
        } else {
          setCmoHistory([]);
        }

        if (assessmentHistoryResult.status === 'fulfilled') {
          setAssessmentHistory(assessmentHistoryResult.value.data);
          if (assessmentHistoryResult.value.errorMessage) {
            setAssessmentHistoryWarning(`Evolución de parámetros no disponible temporalmente: ${assessmentHistoryResult.value.errorMessage}`);
          }
        } else {
          setAssessmentHistory([]);
          setAssessmentHistoryWarning('Evolución de parámetros no disponible temporalmente. La ficha base se cargó correctamente.');
        }

        if (interventionsResult.status === 'fulfilled') {
          setInterventions(
            interventionsResult.value.data.map((x) => ({
              id: x.id,
              visit_id: x.visit_id,
              intervention_type: x.intervention_type,
              priority_level: x.priority_level,
            })),
          );
        } else {
          setInterventions([]);
        }

        if (questionnairesResult.status === 'fulfilled') {
          setQuestionnaires(questionnairesResult.value.data);
          if (questionnairesResult.value.errorMessage) {
            setQuestionnaireWarning(`Cuestionarios no disponibles temporalmente: ${questionnairesResult.value.errorMessage}`);
          }
        } else {
          setQuestionnaires([]);
          setQuestionnaireWarning('Cuestionarios no disponibles temporalmente. La ficha base se cargó correctamente.');
        }

        if (medicationsResult.status === 'fulfilled') {
          setActiveMedications(medicationsResult.value.data);
          if (medicationsResult.value.errorMessage) {
            setMedicationWarning(`Medicación no disponible temporalmente: ${medicationsResult.value.errorMessage}`);
          }
        } else {
          setActiveMedications([]);
          setMedicationWarning('Medicación no disponible temporalmente. La ficha base se cargó correctamente.');
        }

        if (latestMedicationReviewResult.status === 'fulfilled') {
          setLatestMedicationReviewDate(latestMedicationReviewResult.value.data);
          if (latestMedicationReviewResult.value.errorMessage) {
            setMedicationWarning(`Medicación no disponible temporalmente: ${latestMedicationReviewResult.value.errorMessage}`);
          }
        } else {
          setLatestMedicationReviewDate(null);
        }
      } catch {
        setErrorMessage('No se pudo cargar la ficha.');
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [id]);

  const handleStatusChange = async (visitId: string, status: VisitStatus) => {
    const updates = status === 'completed'
      ? { visit_status: status, visit_date: new Date().toISOString().slice(0, 10) }
      : { visit_status: status };
    const { data, errorMessage: err } = await updateVisit(visitId, updates);
    if (!err && data) {
      setVisits((prev) => prev.map((v) => (v.id === visitId ? { ...v, ...data } : v)).sort(compareVisitsTimeline));
    }
  };

  const visitsTimeline = useMemo(() => [...visits].sort(compareVisitsTimeline), [visits]);
  const latestVisitId = useMemo(() => visitsTimeline[visitsTimeline.length - 1]?.id, [visitsTimeline]);

  const cmoHistoryDesc = useMemo(() => [...cmoHistory].sort(compareCmoDesc), [cmoHistory]);

  const scoreByVisitId = useMemo(() => {
    const map = new Map<string, CmoScoreHistoryEntry>();
    cmoHistoryDesc.forEach((entry) => {
      if (!map.has(entry.visit_id)) {
        map.set(entry.visit_id, entry);
      }
    });
    return map;
  }, [cmoHistoryDesc]);

  const interventionsByVisitId = useMemo(() => {
    const map = new Map<string, number>();
    interventions.forEach((item) => {
      map.set(item.visit_id, (map.get(item.visit_id) ?? 0) + 1);
    });
    return map;
  }, [interventions]);

  const questionnaireByVisitId = useMemo(() => {
    const map = new Map<string, Map<string, QuestionnaireResponseRecord>>();
    questionnaires.forEach((item) => {
      if (!map.has(item.visit_id)) map.set(item.visit_id, new Map());
      map.get(item.visit_id)?.set(item.questionnaire_type, item);
    });
    return map;
  }, [questionnaires]);

  const questionnaireCompletionByVisitId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    questionnaires.forEach((item) => {
      if (!map.has(item.visit_id)) map.set(item.visit_id, new Set());
      map.get(item.visit_id)?.add(item.questionnaire_type);
    });
    return map;
  }, [questionnaires]);

  const questionnaireVisits = useMemo(
    () => visitsTimeline.filter((visit) => isQuestionnaireVisitType(visit.visit_type)),
    [visitsTimeline],
  );

  const missingQuestionnaireVisits = useMemo(
    () => questionnaireVisits.filter((visit) => !isVisitQuestionnaireComplete(visit.id, questionnaireCompletionByVisitId)),
    [questionnaireVisits, questionnaireCompletionByVisitId],
  );

  const baselineVisit = useMemo(() => getLatestVisitByType(visitsTimeline, isBaselineVisit), [visitsTimeline]);
  const finalVisit = useMemo(() => getLatestVisitByType(visitsTimeline, isFinalVisit), [visitsTimeline]);

  const baselineIexpac = getQuestionnaireByVisit(questionnaireByVisitId, baselineVisit?.id ?? null, 'iexpac');
  const finalIexpac = getQuestionnaireByVisit(questionnaireByVisitId, finalVisit?.id ?? null, 'iexpac');
  const baselineMorisky = getQuestionnaireByVisit(questionnaireByVisitId, baselineVisit?.id ?? null, 'morisky');
  const finalMorisky = getQuestionnaireByVisit(questionnaireByVisitId, finalVisit?.id ?? null, 'morisky');
  const baselineEq5d = getQuestionnaireByVisit(questionnaireByVisitId, baselineVisit?.id ?? null, 'eq5d');
  const finalEq5d = getQuestionnaireByVisit(questionnaireByVisitId, finalVisit?.id ?? null, 'eq5d');
  const baselinePam10 = getQuestionnaireByVisit(questionnaireByVisitId, baselineVisit?.id ?? null, 'pam10');
  const finalPam10 = getQuestionnaireByVisit(questionnaireByVisitId, finalVisit?.id ?? null, 'pam10');

  const deltaIexpac = (() => {
    const basal = toNullableNumber(baselineIexpac?.total_score);
    const fin = toNullableNumber(finalIexpac?.total_score);
    if (basal === null || fin === null) return null;
    return Number((fin - basal).toFixed(2));
  })();

  const deltaEq5dVas = (() => {
    const basal = toNullableNumber(baselineEq5d?.secondary_score);
    const fin = toNullableNumber(finalEq5d?.secondary_score);
    if (basal === null || fin === null) return null;
    return Number((fin - basal).toFixed(2));
  })();

  const adherenceChange = (() => {
    const basal = toNullableNumber(baselineMorisky?.total_score);
    const fin = toNullableNumber(finalMorisky?.total_score);
    if (basal === null || fin === null) return 'N/A';
    if (basal === fin) return fin === 1 ? 'Sin cambios (Alta)' : 'Sin cambios (Baja)';
    return fin === 1 ? 'Mejora a Alta adherencia' : 'Empeora a Baja adherencia';
  })();

  const latestHistory = cmoHistoryDesc[0] ?? null;
  const previousHistory = cmoHistoryDesc[1] ?? null;
  const cmoDelta = latestHistory && previousHistory ? latestHistory.score - previousHistory.score : null;
  const followupStatus = useMemo(() => getFollowupStatus(visits), [visits]);
  const cmoHistoryAsc = useMemo(() => [...cmoHistoryDesc].reverse(), [cmoHistoryDesc]);
  const formatHistoryLabel = (entry: CmoScoreHistoryEntry) =>
    entry.visit_number != null ? `V${entry.visit_number}` : 'Extraordinaria';

  if (loading) return <LoadingState label="Cargando ficha..." />;
  if (errorMessage) return <ErrorState title="No se pudo cargar la ficha" message={errorMessage} />;
  if (!patient) return <EmptyState title="Paciente no encontrado" description="Verifica el identificador o vuelve al listado." />;

  const questionnaireRows = [
    { key: 'iexpac', label: 'IEXPAC', baseline: baselineIexpac, final: finalIexpac },
    { key: 'morisky', label: 'Morisky-Green', baseline: baselineMorisky, final: finalMorisky },
    { key: 'eq5d', label: 'EQ-5D-5L', baseline: baselineEq5d, final: finalEq5d },
    { key: 'pam10', label: 'PAM-10', baseline: baselinePam10, final: finalPam10 },
  ];
  const checkMark = (present: boolean) => (
    <span className={present ? 'check-cell check-yes' : 'check-cell check-no'}>
      <span aria-hidden="true">{present ? '✓' : '✗'}</span>
      <span className="visually-hidden">{present ? 'Registrado' : 'No registrado'}</span>
    </span>
  );

  return (
    <div className="page-stack">
      <PatientHeader
        eyebrow="IRIS · Ficha de paciente"
        studyCode={patient.study_code}
        sexLabel={getSexLabel(patient.sex)}
        age={patient.age_at_inclusion}
        level={latestCmoScore?.priority ?? null}
        score={latestCmoScore?.score ?? null}
        lastVisitDate={followupStatus.lastAttendedDate}
        followup={followupStatus}
        details={[
          { label: 'Farmacia', value: patient.pharmacy_site || '-' },
          { label: 'Investigador/a', value: patient.investigator_name || '-' },
          {
            label: 'Consentimiento',
            value: patient.consent_signed ? <StatusBadge tone="positive">Sí</StatusBadge> : <StatusBadge tone="warning">No</StatusBadge>,
          },
        ]}
        actions={
          <>
            <Link className="button-link" to={`/patients/${patient.id}/visits/new`}>
              Nueva visita
            </Link>
            {latestVisitId ? (
              <Link className="button-link button-secondary" to={`/visits/${latestVisitId}/stratification`}>
                Estratificación basal
              </Link>
            ) : null}
          </>
        }
      />

      {missingQuestionnaireVisits.length > 0 || questionnaireWarning ? (
        <div className="stack-sm">
          {missingQuestionnaireVisits.length > 0 ? (
            <Notice tone="warning">
              Faltan cuestionarios obligatorios en {missingQuestionnaireVisits.length} visita(s) basal/final.
            </Notice>
          ) : null}
          {questionnaireWarning ? <Notice tone="warning">{questionnaireWarning}</Notice> : null}
        </div>
      ) : null}

      <section className="card" aria-labelledby="patient-visits">
        <SectionHeader id="patient-visits" title="Longitudinalidad de visitas" description="Secuencia cronológica de contactos y su estratificación." />
        {visitsTimeline.length === 0 ? (
          <EmptyState
            title="Sin visitas registradas"
            description="Añade la primera visita para iniciar seguimiento."
            action={<Link className="button-link" to={`/patients/${patient.id}/visits/new`}>Nueva visita</Link>}
          />
        ) : (
          <>
            <VisitTimeline
              visits={visitsTimeline.map((visit) => {
                const scoreEntry = scoreByVisitId.get(visit.id) ?? null;
                return {
                  id: visit.id,
                  visitType: visit.visit_type,
                  date: visit.visit_date ?? visit.scheduled_date ?? null,
                  status: visit.visit_status,
                  level: scoreEntry?.priority ?? null,
                  score: scoreEntry?.score ?? null,
                  href: `/visits/${visit.id}/stratification`,
                };
              })}
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th className="num">Score CMO</th>
                    <th>Nivel CMO</th>
                    <th>Cuestionarios</th>
                    <th className="num">Intervenciones</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visitsTimeline.map((visit) => {
                    const scoreEntry = scoreByVisitId.get(visit.id) ?? null;
                    const interventionsCount = interventionsByVisitId.get(visit.id) ?? 0;
                    const questionnairesReady = !isQuestionnaireVisitType(visit.visit_type) || isVisitQuestionnaireComplete(visit.id, questionnaireCompletionByVisitId);

                    return (
                      <tr key={visit.id}>
                        <td className="strong">{getVisitTypeLabel(visit.visit_type)}</td>
                        <td className="numeric">{visit.visit_date ?? visit.scheduled_date ?? '-'}</td>
                        <td>
                          <div className="table-status">
                            <select
                              value={visit.visit_status ?? ''}
                              onChange={(e) => void handleStatusChange(visit.id, e.target.value as VisitStatus)}
                              aria-label={`Estado de la visita ${getVisitTypeLabel(visit.visit_type)}`}
                            >
                              <option value="" disabled>Estado</option>
                              {VISIT_STATUS_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                            <span className="visually-hidden">{getVisitStatusLabel(visit.visit_status)}</span>
                          </div>
                        </td>
                        <td className="num strong">{scoreEntry ? scoreEntry.score : '-'}</td>
                        <td>{scoreEntry ? <CmoLevelBadge level={scoreEntry.priority} variant="short" /> : <span className="cell-muted">-</span>}</td>
                        <td>
                          {!isQuestionnaireVisitType(visit.visit_type) ? <span className="cell-muted">-</span> : (
                            <StatusBadge tone={questionnairesReady ? 'positive' : 'warning'}>
                              {questionnairesReady ? 'Completos' : 'Pendientes'}
                            </StatusBadge>
                          )}
                        </td>
                        <td className="num">{interventionsCount}</td>
                        <td>
                          <div className="table-actions">
                            <Link to={`/patients/${id}/visits/${visit.id}`}>Detalle visita</Link>
                            <Link to={`/visits/${visit.id}/stratification`}>Evaluación clínica</Link>
                            <Link to={`/visits/${visit.id}/medications`}>Medicación</Link>
                            <Link to={`/visits/${visit.id}/interventions`}>Intervenciones</Link>
                            {isQuestionnaireVisitType(visit.visit_type) ? <Link to={`/visits/${visit.id}/questionnaires`}>Cuestionarios</Link> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="patient-cmo-evolution">
        <SectionHeader
          id="patient-cmo-evolution"
          title="Evolución CMO-RCV"
          description="Mayor puntuación = mayor complejidad. Bandas según los umbrales del modelo de estratificación."
        />
        {latestHistory ? (
          <>
            <MetricGrid columns={4}>
              <MetricCard label="Última puntuación" value={latestHistory.score} unit="pts" />
              <MetricCard label="Nivel actual" value={<CmoLevelBadge level={latestHistory.priority} />} />
              <MetricCard label="Visitas previas con score" value={Math.max(cmoHistoryDesc.length - 1, 0)} />
              <MetricCard
                label="Cambio respecto a visita anterior"
                value={<TrendDelta value={cmoDelta} favorable="lower" />}
                hint={cmoDelta !== null && cmoDelta !== 0 ? (cmoDelta < 0 ? 'Menor complejidad' : 'Mayor complejidad') : undefined}
              />
            </MetricGrid>

            {cmoHistoryAsc.length > 1 ? (
              <div className="section-block dashboard-subsection">
                <ScoreTrendChart
                  points={cmoHistoryAsc.map((entry) => ({ id: entry.id, label: formatHistoryLabel(entry), score: entry.score }))}
                />
                <div className="table-wrap dashboard-subsection">
                  <table>
                    <thead>
                      <tr>
                        <th>Visita</th>
                        <th>Fecha</th>
                        <th className="num">Puntuación</th>
                        <th className="num">Δ vs anterior</th>
                        <th>Nivel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmoHistoryDesc.map((entry, i) => {
                        const prev = cmoHistoryDesc[i + 1];
                        const delta = prev ? entry.score - prev.score : null;
                        return (
                          <tr key={entry.id}>
                            <td className="strong">{formatHistoryLabel(entry)}</td>
                            <td className="numeric">{entry.visit_date ?? entry.scheduled_date ?? entry.updated_at?.slice(0, 10) ?? '-'}</td>
                            <td className="num strong">{entry.score}</td>
                            <td className="num">{delta !== null ? <TrendDelta value={delta} favorable="lower" /> : <span className="cell-muted">—</span>}</td>
                            <td><CmoLevelBadge level={entry.priority} variant="short" /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="empty-inline">Sin puntuación CMO registrada. Completa la estratificación basal.</p>
        )}
      </section>

      <BaselineTrendPanel entries={assessmentHistory} warning={assessmentHistoryWarning} />

      <div className="split-grid">
        <section className="card" aria-labelledby="patient-questionnaires">
          <SectionHeader id="patient-questionnaires" title="Resumen de cuestionarios (tesis)" description="Registro basal frente a visita final." />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cuestionario</th>
                  <th>Basal</th>
                  <th>Final</th>
                </tr>
              </thead>
              <tbody>
                {questionnaireRows.map((row) => (
                  <tr key={row.key}>
                    <td className="strong">{row.label}</td>
                    <td>{checkMark(Boolean(row.baseline))}</td>
                    <td>{checkMark(Boolean(row.final))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="inline-facts">
            <div>
              <dt>Δ IEXPAC</dt>
              <dd><TrendDelta value={deltaIexpac} decimals={2} /></dd>
            </div>
            <div>
              <dt>Δ EQ5D VAS</dt>
              <dd><TrendDelta value={deltaEq5dVas} decimals={2} /></dd>
            </div>
            <div>
              <dt>Cambio adherencia</dt>
              <dd className="inline-facts-text">{adherenceChange}</dd>
            </div>
          </dl>
        </section>

        <section className="card" aria-labelledby="patient-interventions">
          <SectionHeader id="patient-interventions" title="Resumen de intervenciones" />
          {interventions.length === 0 ? (
            <p className="empty-inline">No hay intervenciones registradas.</p>
          ) : (
            <ul className="simple-list">
              {interventions.slice(0, 10).map((item) => (
                <li key={item.id}>
                  <span>{item.intervention_type}</span>
                  <span className="cell-muted">{item.priority_level ? PRIORITY_LEVEL_LABEL[item.priority_level] : '-'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <PatientMedicationSummary
        medications={activeMedications}
        warning={medicationWarning}
        latestReviewDate={latestMedicationReviewDate}
      />
    </div>
  );
}
