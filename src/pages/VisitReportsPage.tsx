import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { VisitTabs } from '../components/common/VisitTabs';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import {
  downloadClinicianVisitReportPdf,
  downloadPatientVisitReportPdf,
  loadVisitReportData,
  type ClinicianVisitReportData,
  type PatientVisitReportData,
} from '../services/reportService';
import { getVisitById } from '../services/visitService';

export function VisitReportsPage() {
  const { visitId = '' } = useParams();

  const [patientReport, setPatientReport] = useState<PatientVisitReportData | null>(null);
  const [clinicianReport, setClinicianReport] = useState<ClinicianVisitReportData | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [visitPatientId, setVisitPatientId] = useState<string>('');
  const [downloading, setDownloading] = useState<'patient' | 'clinician' | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMessage(null);

      const [reportResult, visitResult] = await Promise.all([loadVisitReportData(visitId), getVisitById(visitId)]);
      setPatientReport(reportResult.patientReportData);
      setClinicianReport(reportResult.clinicianReportData);
      setMissingFields(reportResult.missingFields);
      setErrorMessage(reportResult.errorMessage);
      setVisitPatientId(visitResult.data?.patient_id ?? '');
      setLoading(false);
    }

    void loadData();
  }, [visitId]);

  const missingText = useMemo(() => {
    if (missingFields.length === 0) return null;
    return `Campos no disponibles para el informe (MVP): ${missingFields.join(', ')}.`;
  }, [missingFields]);

  async function handlePatientPdfDownload() {
    if (!patientReport || downloading) return;
    setDownloading('patient');
    try {
      await downloadPatientVisitReportPdf(patientReport);
    } catch {
      setErrorMessage('No se pudo generar el informe PDF del paciente.');
    } finally {
      setDownloading(null);
    }
  }

  async function handleClinicianPdfDownload() {
    if (!clinicianReport || downloading) return;
    setDownloading('clinician');
    try {
      await downloadClinicianVisitReportPdf(clinicianReport);
    } catch {
      setErrorMessage('No se pudo generar el informe PDF médico.');
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return (
      <div className="page-stack">
        <section className="card">
          <h1>Informes de visita</h1>
          <LoadingState label="Preparando informes..." />
        </section>
      </div>
    );
  }

  if (!patientReport || !clinicianReport) {
    return <ErrorState title="No se pudieron preparar los informes" message={errorMessage ?? 'No disponible'} />;
  }

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Informes de visita</h1>
        <VisitTabs visitId={visitId} active="reports" />

        {errorMessage || missingText ? (
          <div className="stack-sm report-notices">
            {errorMessage ? <Notice tone="warning">Aviso: {errorMessage}</Notice> : null}
            {missingText ? <Notice tone="info">{missingText}</Notice> : null}
          </div>
        ) : null}

        <div className="form-actions report-actions">
          <button type="button" onClick={() => void handlePatientPdfDownload()} disabled={Boolean(downloading)}>
            {downloading === 'patient' ? 'Generando PDF de paciente...' : 'Descargar informe paciente (PDF)'}
          </button>
          <button type="button" onClick={() => void handleClinicianPdfDownload()} disabled={Boolean(downloading)}>
            {downloading === 'clinician' ? 'Generando PDF médico...' : 'Descargar informe médico (PDF)'}
          </button>
          {visitPatientId ? (
            <Link className="button-link button-secondary" to={`/patients/${visitPatientId}`}>
              Volver a ficha paciente
            </Link>
          ) : null}
        </div>

        <p className="help-text">Los informes se generan directamente en formato PDF profesional, sin popups ni HTML intermedio.</p>
      </section>
    </div>
  );
}
