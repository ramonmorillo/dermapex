import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { SEX_TYPE_OPTIONS } from '../constants/enums';
import type { SexType } from '../constants/enums';
import { ErrorState } from '../components/common/ErrorState';
import { PageHeader } from '../components/ui/PageHeader';
import { listAccessibleCenters, type Center } from '../services/centerService';
import { createPatient } from '../services/patientService';

export function NewPatientPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<{
    center_id: string;
    inclusion_date: string;
    screening_date: string;
    birth_date: string;
    age_at_inclusion: string;
    sex: SexType | '';
    consent_signed: boolean;
  }>({
    center_id: '',
    inclusion_date: '',
    screening_date: '',
    birth_date: '',
    age_at_inclusion: '',
    sex: '',
    consent_signed: false,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [centers, setCenters] = useState<Center[]>([]);
  const [centersError, setCentersError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await listAccessibleCenters();
      setCenters(result.data);
      setCentersError(result.errorMessage);
      if (result.data.length === 1 && result.data[0].study_number !== null) {
        setForm((p) => ({ ...p, center_id: result.data[0].id }));
      }
    })();
  }, []);

  useEffect(() => {
    if (!form.birth_date || !form.inclusion_date) return;
    const birth = new Date(form.birth_date);
    const inclusion = new Date(form.inclusion_date);
    let age = inclusion.getFullYear() - birth.getFullYear();
    const m = inclusion.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && inclusion.getDate() < birth.getDate())) age--;
    if (age >= 0 && age <= 120) {
      setForm((p) => ({ ...p, age_at_inclusion: String(age) }));
    }
  }, [form.birth_date, form.inclusion_date]);

  const selectedCenter = centers.find((center) => center.id === form.center_id) ?? null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    const result = await createPatient({
      center_id: form.center_id,
      inclusion_date: form.inclusion_date || null,
      screening_date: form.screening_date || null,
      // La fecha de nacimiento solo se usa para calcular la edad; no se envía ni se almacena.
      age_at_inclusion: form.age_at_inclusion ? Number(form.age_at_inclusion) : null,
      sex: form.sex || null,
      consent_signed: form.consent_signed,
    });

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setSaving(false);
      return;
    }

    navigate(result.data ? `/patients/${result.data.id}` : '/patients');
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="DERMAPEX · Cohorte"
        title="Alta de paciente"
        description="Registro de inclusión en el estudio. Los campos marcados con * son obligatorios."
      />
    <section className="card">
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="grid-2">
          <label>
            <span>Centro <span className="required-mark" aria-hidden="true">*</span></span>
            <select
              value={form.center_id}
              onChange={(e) => setForm((p) => ({ ...p, center_id: e.target.value }))}
              required
              disabled={centers.length === 0}
            >
              <option value="" disabled>
                {centers.length === 0 ? 'Sin centros asignados' : 'Selecciona un centro'}
              </option>
              {centers.map((center) => (
                <option key={center.id} value={center.id} disabled={center.study_number === null}>
                  {center.code} · {center.name}
                  {center.study_number === null ? ' (sin número de estudio: contacte con coordinación)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="panel-field">
            <span>Código de estudio</span>
            <p className="help-text">
              {selectedCenter?.study_number
                ? `Se asignará automáticamente al guardar: DPX-${selectedCenter.study_number}-NNNN (siguiente número del centro).`
                : 'Se asigna automáticamente al guardar (DPX-<n.º de centro>-NNNN).'}
            </p>
          </div>
          <label>
            Fecha inclusión
            <input
              type="date"
              value={form.inclusion_date}
              onChange={(e) => setForm((p) => ({ ...p, inclusion_date: e.target.value }))}
            />
          </label>
          <label>
            Fecha screening
            <input
              type="date"
              value={form.screening_date}
              onChange={(e) => setForm((p) => ({ ...p, screening_date: e.target.value }))}
            />
          </label>
          <label>
            Fecha nacimiento (solo para calcular la edad; no se guarda)
            <input type="date" value={form.birth_date} onChange={(e) => setForm((p) => ({ ...p, birth_date: e.target.value }))} />
          </label>
          <label>
            Edad inclusión
            <input
              type="number"
              value={form.age_at_inclusion}
              onChange={(e) => setForm((p) => ({ ...p, age_at_inclusion: e.target.value }))}
              min={18}
              max={120}
            />
          </label>
          <label>
            <span>Sexo <span className="required-mark" aria-hidden="true">*</span></span>
            <select value={form.sex} onChange={(e) => setForm((p) => ({ ...p, sex: e.target.value as SexType }))} required>
              <option value="" disabled>
                Selecciona una opción
              </option>
              {SEX_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.consent_signed}
            onChange={(e) => setForm((p) => ({ ...p, consent_signed: e.target.checked }))}
          />
          Consentimiento firmado
        </label>
        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar paciente'}
          </button>
          <Link className="button-link button-secondary" to="/patients">
            Cancelar
          </Link>
        </div>
      </form>
      {centersError ? <ErrorState title="No se pudieron cargar los centros" message={centersError} /> : null}
      {!centersError && centers.length === 0 ? (
        <ErrorState
          title="Sin centro asignado"
          message="Tu usuario no tiene ningún centro participante asignado. Solicita el alta a la coordinación del estudio."
        />
      ) : null}
      {errorMessage ? <ErrorState title="No se pudo guardar" message={errorMessage} /> : null}
    </section>
    </div>
  );
}
