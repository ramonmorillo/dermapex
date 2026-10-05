import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { CmoLevelBadge } from '../components/ui/CmoLevelBadge';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { getSexLabel } from '../constants/enums';
import { deletePatientById, listPatients, type Patient } from '../services/patientService';
import { supabase } from '../lib/supabase';

type PriorityEntry = { score: number; priority: 1 | 2 | 3 };
type PriorityMap = Record<string, PriorityEntry>;

export function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [priorities, setPriorities] = useState<PriorityMap>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null);

  async function loadPatients(searchCode?: string) {
    setLoading(true);
    setAppliedSearch(searchCode?.trim() ?? '');
    const result = await listPatients(searchCode);
    setPatients(result.data);
    setErrorMessage(result.errorMessage);

    if (supabase && result.data.length > 0) {
      const ids = result.data.map((p) => p.id);
      const { data } = await supabase
        .from('cmo_scores')
        .select('score,priority,visits!inner(patient_id)')
        .in('visits.patient_id', ids)
        .order('created_at', { ascending: false });

      const map: PriorityMap = {};
      for (const row of (data ?? []) as Array<{ score: number; priority: number; visits: { patient_id: string } | Array<{ patient_id: string }> }>) {
        const patientId = Array.isArray(row.visits) ? row.visits[0]?.patient_id : row.visits?.patient_id;
        const p = Number(row.priority) as 1 | 2 | 3;
        if (patientId && !map[patientId] && (p === 1 || p === 2 || p === 3)) {
          map[patientId] = { score: row.score, priority: p };
        }
      }
      setPriorities(map);
    } else {
      setPriorities({});
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadPatients();
  }, []);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    await loadPatients(search);
  };

  const handleDeletePatient = async (patient: Patient) => {
    const confirmed = window.confirm('¿Seguro que deseas eliminar este paciente?');
    if (!confirmed) {
      return;
    }

    setActionMessage(null);
    setDeletingPatientId(patient.id);
    const result = await deletePatientById(patient.id);
    setDeletingPatientId(null);

    if (result.errorMessage || !result.success) {
      setActionMessage({
        type: 'error',
        text: result.errorMessage ?? 'No se pudo eliminar el paciente.',
      });
      return;
    }

    setActionMessage({
      type: 'success',
      text: `Paciente ${patient.study_code} eliminado correctamente.`,
    });
    await loadPatients(search);
  };

  if (loading) return <LoadingState label="Cargando pacientes..." />;
  if (errorMessage) return <ErrorState title="No se pudo cargar el listado" message={errorMessage} />;

  // Sin término de búsqueda: estado vacío de cohorte. Con búsqueda: se mantiene el buscador visible.
  if (patients.length === 0 && !appliedSearch) {
    return (
      <EmptyState
        title="Sin pacientes registrados"
        description="Empieza creando el primer paciente del estudio."
        action={<Link className="button-link" to="/patients/new">Nuevo paciente</Link>}
      />
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="IRIS · Cohorte"
        title="Pacientes"
        description={`${patients.length} ${patients.length === 1 ? 'paciente' : 'pacientes'} en el listado. Prioridad actual = última puntuación CMO registrada.`}
        actions={
          <Link className="button-link" to="/patients/new">
            Nuevo paciente
          </Link>
        }
      />

      <section className="card">
        <form className="search-row" onSubmit={handleSearch} role="search">
          <label className="visually-hidden" htmlFor="patient-search">
            Buscar por study_code
          </label>
          <input
            id="patient-search"
            type="search"
            placeholder="Buscar por study_code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="submit" className="button-secondary">Buscar</button>
        </form>
        {actionMessage ? (
          <Notice tone={actionMessage.type === 'success' ? 'success' : 'danger'} className="list-notice">
            {actionMessage.text}
          </Notice>
        ) : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Study code</th>
                <th>Sexo</th>
                <th className="num">Edad inclusión</th>
                <th>Inclusión</th>
                <th>Prioridad actual</th>
                <th><span className="visually-hidden">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="cell-muted">
                    Sin resultados para “{appliedSearch}”.
                  </td>
                </tr>
              ) : null}
              {patients.map((patient) => (
                <tr key={patient.id}>
                  <td className="strong">
                    <Link to={`/patients/${patient.id}`}>{patient.study_code}</Link>
                  </td>
                  <td>{getSexLabel(patient.sex)}</td>
                  <td className="num">{patient.age_at_inclusion ?? '-'}</td>
                  <td className="numeric">{patient.inclusion_date || '-'}</td>
                  <td>
                    {priorities[patient.id] ? (
                      <CmoLevelBadge level={priorities[patient.id].priority} score={priorities[patient.id].score} variant="short" />
                    ) : (
                      <span className="cell-muted">-</span>
                    )}
                  </td>
                  <td>
                    <div className="table-actions table-actions-end">
                      <Link to={`/patients/${patient.id}`}>Abrir ficha</Link>
                      <button
                        type="button"
                        className="button-danger button-sm"
                        onClick={() => void handleDeletePatient(patient)}
                        disabled={deletingPatientId === patient.id}
                      >
                        {deletingPatientId === patient.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
