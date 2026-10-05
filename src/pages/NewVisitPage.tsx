import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { VISIT_STATUS_OPTIONS, VISIT_TYPE_OPTIONS } from '../constants/enums';
import type { VisitStatus, VisitType } from '../constants/enums';
import { getVisitNumberByType, normalizeVisitTypeValue } from '../constants/enums';
import { ErrorState } from '../components/common/ErrorState';
import { PageHeader } from '../components/ui/PageHeader';
import { getPatientById } from '../services/patientService';
import { createVisit, getVisitById, updateVisit } from '../services/visitService';

// Identificador del paciente para la cabecera (solo lectura).
function usePatientStudyCode(patientId: string): string | null {
  const [studyCode, setStudyCode] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    if (!patientId) return undefined;
    void getPatientById(patientId).then((result) => {
      if (mounted) setStudyCode(result.data?.study_code ?? null);
    });
    return () => {
      mounted = false;
    };
  }, [patientId]);
  return studyCode;
}

type VisitForm = {
  visit_type: VisitType;
  scheduled_date: string;
  visit_date: string;
  visit_status: VisitStatus;
  extraordinary_reason: string;
  notes: string;
};

const INITIAL_FORM: VisitForm = {
  visit_type: 'baseline',
  scheduled_date: '',
  visit_date: '',
  visit_status: 'scheduled',
  extraordinary_reason: '',
  notes: '',
};

export function NewVisitPage() {
  const { id = '', visitId = '' } = useParams();
  const navigate = useNavigate();
  const isExistingVisit = Boolean(visitId);
  const [form, setForm] = useState<VisitForm>(INITIAL_FORM);
  const [initialSnapshot, setInitialSnapshot] = useState<VisitForm | null>(null);
  const [isEditingVisit, setIsEditingVisit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadVisit() {
      if (!isExistingVisit) return;
      const result = await getVisitById(visitId);
      if (result.errorMessage || !result.data) {
        setErrorMessage(result.errorMessage ?? 'No se pudo cargar la visita.');
        return;
      }
      const loaded: VisitForm = {
        visit_type: result.data.visit_type,
        scheduled_date: result.data.scheduled_date ?? '',
        visit_date: result.data.visit_date ?? '',
        visit_status: (result.data.visit_status ?? 'scheduled') as VisitStatus,
        extraordinary_reason: result.data.extraordinary_reason ?? '',
        notes: result.data.notes ?? '',
      };
      setForm(loaded);
      setInitialSnapshot(loaded);
      setIsEditingVisit(false);
    }
    void loadVisit();
  }, [isExistingVisit, visitId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    if (isExistingVisit) {
      const result = await updateVisit(visitId, {
        visit_type: form.visit_type,
        visit_number: getVisitNumberByType(form.visit_type),
        scheduled_date: form.scheduled_date || null,
        visit_date: form.visit_date || null,
        visit_status: form.visit_status || null,
        extraordinary_reason: normalizeVisitTypeValue(form.visit_type) === 'extra' ? form.extraordinary_reason || null : null,
        notes: form.notes || null,
      });
      if (result.errorMessage || !result.data) {
        setErrorMessage(result.errorMessage ?? 'No se pudo actualizar la visita.');
        setSaving(false);
        return;
      }
      const savedSnapshot: VisitForm = {
        visit_type: result.data.visit_type,
        scheduled_date: result.data.scheduled_date ?? '',
        visit_date: result.data.visit_date ?? '',
        visit_status: (result.data.visit_status ?? 'scheduled') as VisitStatus,
        extraordinary_reason: result.data.extraordinary_reason ?? '',
        notes: result.data.notes ?? '',
      };
      setForm(savedSnapshot);
      setInitialSnapshot(savedSnapshot);
      setIsEditingVisit(false);
      setSaving(false);
      return;
    }

    const result = await createVisit({
      patient_id: id,
      visit_type: form.visit_type,
      visit_number: getVisitNumberByType(form.visit_type),
      scheduled_date: form.scheduled_date || null,
      visit_date: form.visit_date || null,
      visit_status: form.visit_status || null,
      extraordinary_reason: normalizeVisitTypeValue(form.visit_type) === 'extra' ? form.extraordinary_reason || null : null,
      notes: form.notes || null,
    });

    if (result.errorMessage || !result.data) {
      setErrorMessage(result.errorMessage ?? 'No se recibió la visita creada.');
      setSaving(false);
      return;
    }

    navigate(`/visits/${result.data.id}/stratification`);
  };

  const readOnly = isExistingVisit && !isEditingVisit;
  const studyCode = usePatientStudyCode(id);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={studyCode ? `Paciente ${studyCode}` : 'Paciente'}
        title={isExistingVisit ? 'Detalle de visita' : 'Nueva visita'}
        description={
          isExistingVisit
            ? 'Datos administrativos de la visita. Pulsa «Editar visita» para modificarlos.'
            : 'Al guardar se abrirá la evaluación clínica y estratificación CMO de la visita.'
        }
      />
    <section className="card">
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="grid-2">
          <label>
            Tipo de visita
            <select disabled={readOnly} value={form.visit_type} onChange={(e) => setForm((p) => ({ ...p, visit_type: e.target.value as VisitType }))}>
              {VISIT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="help-text field-hint-inline">
            Número de visita calculado automáticamente: {getVisitNumberByType(form.visit_type) ?? 'Extraordinaria'}.
          </p>
          <label>
            Fecha programada
            <input disabled={readOnly} type="date" value={form.scheduled_date} onChange={(e) => setForm((p) => ({ ...p, scheduled_date: e.target.value }))} />
          </label>
          <label>
            Fecha de visita
            <input disabled={readOnly} type="date" value={form.visit_date} onChange={(e) => setForm((p) => ({ ...p, visit_date: e.target.value }))} />
          </label>
          <label>
            Estado visita
            <select disabled={readOnly} value={form.visit_status} onChange={(e) => setForm((p) => ({ ...p, visit_status: e.target.value as VisitStatus }))}>
              {VISIT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {normalizeVisitTypeValue(form.visit_type) === 'extra' ? (
            <label>
              Motivo visita extra
              <input disabled={readOnly} value={form.extraordinary_reason} onChange={(e) => setForm((p) => ({ ...p, extraordinary_reason: e.target.value }))} />
            </label>
          ) : null}
        </div>
        <label>
          Notas
          <textarea disabled={readOnly} rows={4} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </label>
        <div className="form-actions">
          {isExistingVisit ? (
            readOnly ? (
              <button type="button" onClick={() => setIsEditingVisit(true)}>Editar visita</button>
            ) : (
              <>
                <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
                <button type="button" className="button-secondary" onClick={() => {
                  if (initialSnapshot) setForm(initialSnapshot);
                  setIsEditingVisit(false);
                }}>Cancelar</button>
              </>
            )
          ) : (
            <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar visita y continuar'}</button>
          )}
          <Link to={isExistingVisit ? `/patients/${id}` : `/patients/${id}`}>Volver</Link>
        </div>
      </form>
      {errorMessage ? <ErrorState title={isExistingVisit ? 'No se pudo actualizar la visita' : 'No se pudo guardar la visita'} message={errorMessage} /> : null}
    </section>
    </div>
  );
}
