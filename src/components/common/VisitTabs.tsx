import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getSexLabel, getVisitTypeLabel } from '../../constants/enums';
import { getLatestCmoScoreByPatient } from '../../services/cmoScoreService';
import { getPatientById, type Patient } from '../../services/patientService';
import { getVisitById, type Visit } from '../../services/visitService';
import { CmoLevelBadge } from '../ui/CmoLevelBadge';

type VisitTab = 'clinical' | 'medications' | 'interventions' | 'questionnaires' | 'process' | 'documents' | 'reports';

type VisitTabsProps = {
  visitId: string;
  active: VisitTab;
};

const TABS: Array<{ key: VisitTab; label: string; path: string }> = [
  { key: 'clinical', label: 'Datos clínicos', path: 'stratification' },
  { key: 'medications', label: 'Medicación', path: 'medications' },
  { key: 'interventions', label: 'Intervenciones', path: 'interventions' },
  { key: 'questionnaires', label: 'Cuestionarios', path: 'questionnaires' },
  { key: 'process', label: 'Proceso', path: 'process' },
  { key: 'documents', label: 'Documentos', path: 'documents' },
  { key: 'reports', label: 'Informes', path: 'reports' },
];

type VisitContext = {
  visit: Visit;
  patient: Patient | null;
  latestLevel: number | null;
  latestScore: number | null;
};

// Contexto de solo lectura: identifica paciente y visita en todas las pantallas de visita.
function VisitPatientContext({ visitId }: { visitId: string }) {
  const [context, setContext] = useState<VisitContext | null>(null);

  useEffect(() => {
    let mounted = true;
    setContext(null);

    void (async () => {
      const visitResult = await getVisitById(visitId);
      if (!mounted || !visitResult.data) return;
      const visit = visitResult.data;

      const [patientResult, scoreResult] = await Promise.allSettled([
        getPatientById(visit.patient_id),
        getLatestCmoScoreByPatient(visit.patient_id),
      ]);
      if (!mounted) return;

      const score = scoreResult.status === 'fulfilled' ? scoreResult.value.data : null;
      setContext({
        visit,
        patient: patientResult.status === 'fulfilled' ? patientResult.value.data : null,
        latestLevel: score?.priority ?? null,
        latestScore: score?.score ?? null,
      });
    })();

    return () => {
      mounted = false;
    };
  }, [visitId]);

  if (!context) {
    return <div className="visit-context visit-context-loading" aria-hidden="true" />;
  }

  const { visit, patient, latestLevel, latestScore } = context;
  const demographics = [
    patient?.sex ? getSexLabel(patient.sex) : null,
    typeof patient?.age_at_inclusion === 'number' ? `${patient.age_at_inclusion} años` : null,
  ].filter(Boolean);

  return (
    <div className="visit-context" aria-label="Paciente y visita en revisión">
      <div className="visit-context-patient">
        <span className="visit-context-label">Paciente</span>
        <Link to={`/patients/${visit.patient_id}`} className="visit-context-code">
          {patient?.study_code ?? 'Ficha del paciente'}
        </Link>
        {demographics.length > 0 ? <span className="visit-context-muted">{demographics.join(' · ')}</span> : null}
      </div>
      <div className="visit-context-item">
        <span className="visit-context-label">Visita</span>
        <span>
          {getVisitTypeLabel(visit.visit_type)}
          <span className="visit-context-muted numeric"> · {visit.visit_date ?? visit.scheduled_date ?? 'sin fecha'}</span>
        </span>
      </div>
      <div className="visit-context-item">
        <span className="visit-context-label">Nivel actual del paciente</span>
        {latestLevel ? <CmoLevelBadge level={latestLevel} score={latestScore} variant="short" /> : <span className="visit-context-muted">Sin estratificar</span>}
      </div>
    </div>
  );
}

export function VisitTabs({ visitId, active }: VisitTabsProps) {
  return (
    <>
      <VisitPatientContext visitId={visitId} />
      <nav className="visit-tabs" aria-label="Navegación de visita">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            className={active === tab.key ? 'visit-tab active' : 'visit-tab'}
            aria-current={active === tab.key ? 'page' : undefined}
            to={`/visits/${visitId}/${tab.path}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
