import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { VisitTabs } from '../components/common/VisitTabs';
import { MedicationPanel } from '../features/medications/MedicationPanel';
import { getVisitById } from '../services/visitService';

export function VisitMedicationsPage() {
  const { visitId = '' } = useParams();
  const [patientId, setPatientId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await getVisitById(visitId);
      if (result.errorMessage || !result.data?.patient_id) {
        setErrorMessage(result.errorMessage ?? 'No se pudo resolver el paciente de la visita.');
        return;
      }
      setPatientId(result.data.patient_id);
      setErrorMessage(null);
    })();
  }, [visitId]);

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Medicación de visita</h1>
        <VisitTabs visitId={visitId} active="medications" />
      </section>

      {errorMessage ? <ErrorState title="No se pudo cargar la medicación" message={errorMessage} /> : null}
      {patientId ? <MedicationPanel visitId={visitId} patientId={patientId} /> : null}
    </div>
  );
}
