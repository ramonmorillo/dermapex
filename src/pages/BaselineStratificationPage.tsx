import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { VisitTabs } from '../components/common/VisitTabs';
import { CmoLevelBadge } from '../components/ui/CmoLevelBadge';
import { Notice } from '../components/ui/Notice';
import { SectionHeader } from '../components/ui/SectionHeader';
import { CMO_ENGINE_NAME } from '../services/cmoScoringEngine';
import { getCmoScoreByVisit, type CmoScoreRecord } from '../services/cmoScoreService';
import { getVisitById } from '../services/visitService';

/**
 * Datos clínicos y estratificación de la visita — MÓDULO PENDIENTE DE SUSTITUCIÓN.
 *
 * En IRIS esta página capturaba la evaluación clínica cardiovascular (clinical_assessments:
 * PA, perfil lipídico, HbA1c, SCORE2, Framingham…) y calculaba el nivel CMO-RCV.
 * Ambos elementos se han retirado en la migración. Esta página se reconstruirá cuando estén
 * definidos: (1) las variables clínicas de dermatitis atópica del protocolo y (2) el
 * CMO-DERMAPEX scoring engine. Mientras tanto solo muestra, en lectura, una puntuación
 * CMO que ya existiera para la visita (no debería haber ninguna en una base DERMAPEX nueva).
 */
export function BaselineStratificationPage() {
  const { visitId = '' } = useParams();
  const [visitPatientId, setVisitPatientId] = useState('');
  const [savedScore, setSavedScore] = useState<CmoScoreRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const [visitResult, scoreResult] = await Promise.all([getVisitById(visitId), getCmoScoreByVisit(visitId)]);
      if (!mounted) return;
      if (visitResult.data?.patient_id) setVisitPatientId(visitResult.data.patient_id);
      setSavedScore(scoreResult.data);
      setErrorMessage(visitResult.errorMessage ?? scoreResult.errorMessage ?? null);
    })();

    return () => {
      mounted = false;
    };
  }, [visitId]);

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Datos clínicos y estratificación</h1>
        <VisitTabs visitId={visitId} active="clinical" />

        <Notice tone="warning">
          <p>
            <strong>Módulo pendiente de implementación.</strong> La captura de variables clínicas de dermatitis atópica y
            el {CMO_ENGINE_NAME} se implementarán a partir del protocolo oficial DERMAPEX.
          </p>
          <p>
            El formulario y el motor de estratificación heredados de IRIS (riesgo cardiovascular) se han retirado y no se
            aplican en DERMAPEX. Esta visita no puede estratificarse todavía.
          </p>
        </Notice>

        {errorMessage ? <ErrorState title="No se pudo cargar la visita" message={errorMessage} /> : null}
      </section>

      <section className="card" aria-labelledby="saved-score-title">
        <SectionHeader
          id="saved-score-title"
          title="Puntuación CMO registrada"
          description="Lectura de la puntuación almacenada para esta visita, si existe. No se recalcula."
        />
        {savedScore ? (
          <CmoLevelBadge level={savedScore.priority} score={savedScore.score} />
        ) : (
          <p className="empty-inline">Sin puntuación CMO registrada para esta visita.</p>
        )}
        <div className="actions-inline section-footer-actions">
          <Link to={`/visits/${visitId}/interventions`}>Ir a intervenciones</Link>
          {visitPatientId ? <Link to={`/patients/${visitPatientId}`}>Volver a paciente</Link> : null}
        </div>
      </section>
    </div>
  );
}
