import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { SEX_TYPE_OPTIONS } from '../constants/enums';
import type { SexType } from '../constants/enums';
import { ErrorState } from '../components/common/ErrorState';
import { PageHeader } from '../components/ui/PageHeader';
import { createPatient } from '../services/patientService';

export function NewPatientPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<{
    study_code: string;
    pharmacy_site: string;
    investigator_name: string;
    inclusion_date: string;
    screening_date: string;
    birth_date: string;
    age_at_inclusion: string;
    sex: SexType | '';
    consent_signed: boolean;
  }>({
    study_code: '',
    pharmacy_site: '',
    investigator_name: '',
    inclusion_date: '',
    screening_date: '',
    birth_date: '',
    age_at_inclusion: '',
    sex: '',
    consent_signed: false,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    const result = await createPatient({
      study_code: form.study_code,
      pharmacy_site: form.pharmacy_site || null,
      investigator_name: form.investigator_name || null,
      inclusion_date: form.inclusion_date || null,
      screening_date: form.screening_date || null,
      birth_date: form.birth_date || null,
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
        eyebrow="IRIS · Cohorte"
        title="Alta de paciente"
        description="Registro de inclusión en el estudio. Los campos marcados con * son obligatorios."
      />
    <section className="card">
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="grid-2">
          <label>
            <span>Study code <span className="required-mark" aria-hidden="true">*</span></span>
            <input value={form.study_code} onChange={(e) => setForm((p) => ({ ...p, study_code: e.target.value }))} required />
          </label>
          <label>
            Farmacia
            <input value={form.pharmacy_site} onChange={(e) => setForm((p) => ({ ...p, pharmacy_site: e.target.value }))} />
          </label>
          <label>
            Investigador/a
            <input
              value={form.investigator_name}
              onChange={(e) => setForm((p) => ({ ...p, investigator_name: e.target.value }))}
            />
          </label>
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
            Fecha nacimiento
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
      {errorMessage ? <ErrorState title="No se pudo guardar" message={errorMessage} /> : null}
    </section>
    </div>
  );
}
