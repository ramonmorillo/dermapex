import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { VisitTabs } from '../components/common/VisitTabs';
import { UsualCareInterventionsPanel } from '../components/interventions/UsualCareInterventionsPanel';
import { CmoLevelBadge } from '../components/ui/CmoLevelBadge';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { ProtocolPackage } from '../components/ui/ProtocolPackage';
import { SectionHeader } from '../components/ui/SectionHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CMO_LEVEL_META, toCmoLevel } from '../constants/cmoLevels';
import {
  INTERVENTION_CATALOG_VERSION,
  INTERVENTION_CATEGORY_LABEL,
  INTERVENTION_TIER_LABEL,
  STUDY_ARM_LABEL,
} from '../constants/dermapexStudyConfig';
import type { CmoLevel } from '../services/cmoScoringEngine';
import { getCmoScoreByVisit, listCmoScoresByPatient } from '../services/cmoScoreService';
import {
  filterCatalogForLevel,
  listInterventionCatalog,
  type CmoPillar,
  type InterventionCatalogItem,
} from '../services/interventionCatalogService';
import {
  createIntervention,
  updateIntervention,
  listInterventionsByVisit,
  type Intervention,
  type PriorityLevel,
} from '../services/interventionService';
import { getPatientById, type Patient } from '../services/patientService';
import { getVisitById } from '../services/visitService';
import { pickReferenceStratification } from '../utils/referenceStratification';

const OTHER_INTERVENTION_CODE = '__other__';

const CMO_PILLAR_LABEL: Record<CmoPillar, string> = {
  capacidad: 'Capacidad',
  motivacion: 'Motivación',
  oportunidad: 'Oportunidad',
};

const CMO_PILLAR_OPTIONS: Array<{ value: CmoPillar; label: string }> = [
  { value: 'capacidad', label: 'Capacidad' },
  { value: 'motivacion', label: 'Motivación' },
  { value: 'oportunidad', label: 'Oportunidad' },
];

// Prioridad de la intervención (no es el nivel CMO; se propone a partir de él).
const INTERVENTION_PRIORITY_LABEL: Record<PriorityLevel, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const CMO_PRIORITY_TO_INTERVENTION_PRIORITY: Record<CmoLevel, PriorityLevel> = { 1: 'high', 2: 'medium', 3: 'low' };

function normalizeCmoPillar(value: string | null | undefined): CmoPillar | '' {
  if (!value) return '';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'capacidad') return 'capacidad';
  if (normalized === 'motivación' || normalized === 'motivacion') return 'motivacion';
  if (normalized === 'oportunidad') return 'oportunidad';
  return '';
}

function toDbCmoPillar(value: CmoPillar | ''): string | null {
  return value ? CMO_PILLAR_LABEL[value] : null;
}

type FormState = {
  catalog_choice: string;
  cmo_pillar: CmoPillar | '';
  priority_level: PriorityLevel;
  delivered: boolean;
  linked_to_cmo_level: string;
  outcome: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  catalog_choice: '',
  cmo_pillar: '',
  priority_level: 'low',
  delivered: true,
  linked_to_cmo_level: '',
  outcome: '',
  notes: '',
};

/**
 * Intervenciones de la visita. Centros CMO: catálogo CMO (D5). Centros estándar: listado neutro de
 * actividades por desplegable (UsualCareInterventionsPanel; decisión IP 2026-10-07). El catálogo se lee de intervention_catalog (versión
 * INTERVENTION_CATALOG_VERSION, D7) y se filtra por los niveles recomendados del nivel vigente (D8),
 * con opción «ver todas». Junto al catálogo se muestra el paquete mínimo del protocolo del nivel.
 */
export function VisitInterventionsPage() {
  const { visitId = '' } = useParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visitPatientId, setVisitPatientId] = useState('');
  const [currentLevel, setCurrentLevel] = useState<{ level: CmoLevel; score: number; date: string | null; own: boolean } | null>(null);
  const [catalog, setCatalog] = useState<InterventionCatalogItem[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [items, setItems] = useState<Intervention[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [otherIntervention, setOtherIntervention] = useState('');
  const [editingInterventionId, setEditingInterventionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadInterventions() {
    const listRes = await listInterventionsByVisit(visitId);
    setItems(listRes.data);
    if (listRes.errorMessage) setErrorMessage(listRes.errorMessage);
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setLoading(true);
      const { data: visit, errorMessage: visitError } = await getVisitById(visitId);
      if (!mounted) return;
      if (!visit) {
        setErrorMessage(visitError ?? 'Visita no encontrada.');
        setLoading(false);
        return;
      }
      setVisitPatientId(visit.patient_id);
      const { data: patientData } = await getPatientById(visit.patient_id);
      if (!mounted) return;
      setPatient(patientData);

      if (patientData?.center?.study_arm === 'cmo') {
        const [{ data: visitScore }, catalogResult] = await Promise.all([
          getCmoScoreByVisit(visitId),
          listInterventionCatalog(INTERVENTION_CATALOG_VERSION),
        ]);
        let reference: { level: CmoLevel; score: number; date: string | null; own: boolean } | null = null;
        if (visitScore) {
          reference = { level: visitScore.priority, score: Number(visitScore.score), date: visit.visit_date ?? visit.scheduled_date, own: true };
        } else {
          // Visita sin estratificación propia: nivel vigente = última estratificación previa.
          const { data: history } = await listCmoScoresByPatient(visit.patient_id);
          const prior = pickReferenceStratification(history, visit.visit_date ?? visit.scheduled_date);
          const level = toCmoLevel(prior?.priority);
          if (prior && level) reference = { level, score: Number(prior.score), date: prior.visit_date ?? prior.scheduled_date, own: false };
        }
        if (!mounted) return;
        setCatalog(catalogResult.data);
        if (catalogResult.errorMessage) setErrorMessage(catalogResult.errorMessage);
        setCurrentLevel(reference);
        if (reference) {
          setForm({ ...EMPTY_FORM, priority_level: CMO_PRIORITY_TO_INTERVENTION_PRIORITY[reference.level], linked_to_cmo_level: String(reference.level) });
        }
        await loadInterventions();
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [visitId]);

  const visibleCatalog = useMemo(
    () => filterCatalogForLevel(catalog, currentLevel?.level ?? null, showAll),
    [catalog, currentLevel, showAll],
  );

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);

  const handleCatalogSelection = (choice: string) => {
    if (choice === OTHER_INTERVENTION_CODE || choice === '') {
      setForm((prev) => ({ ...prev, catalog_choice: choice, cmo_pillar: '' }));
      return;
    }
    const selected = catalogById.get(choice);
    setForm((prev) => ({ ...prev, catalog_choice: choice, cmo_pillar: selected?.cmo_pillar ?? '' }));
    setOtherIntervention('');
  };

  const resetForm = () => {
    setForm((prev) => ({ ...prev, catalog_choice: '', cmo_pillar: '', outcome: '', notes: '' }));
    setOtherIntervention('');
    setEditingInterventionId(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    const isOther = form.catalog_choice === OTHER_INTERVENTION_CODE;
    const catalogItem = isOther ? null : catalogById.get(form.catalog_choice) ?? null;
    const interventionType = isOther ? otherIntervention.trim() : catalogItem?.label ?? '';

    if (!interventionType) {
      setErrorMessage('Selecciona una intervención del catálogo o escribe «Otra intervención».');
      setSaving(false);
      return;
    }

    // Para tarjetas de catálogo, texto, pilar, código y versión los sella la base de datos desde el catálogo.
    const payload = {
      intervention_type: interventionType,
      intervention_domain: toDbCmoPillar(form.cmo_pillar),
      catalog_item_id: catalogItem?.id ?? null,
      priority_level: form.priority_level,
      delivered: form.delivered,
      linked_to_cmo_level: Number(form.linked_to_cmo_level),
      outcome: form.outcome || null,
      notes: form.notes || null,
    };

    const result = editingInterventionId
      ? await updateIntervention(editingInterventionId, payload)
      : await createIntervention({ ...payload, visit_id: visitId });

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setSaving(false);
      return;
    }

    resetForm();
    setSaving(false);
    await loadInterventions();
  };

  const handleEditIntervention = (item: Intervention) => {
    setEditingInterventionId(item.id);
    setForm({
      catalog_choice: item.catalog_item_id ?? OTHER_INTERVENTION_CODE,
      cmo_pillar: normalizeCmoPillar(item.intervention_domain),
      priority_level: item.priority_level ?? 'low',
      delivered: item.delivered ?? true,
      linked_to_cmo_level: String(item.linked_to_cmo_level ?? currentLevel?.level ?? ''),
      outcome: item.outcome ?? '',
      notes: item.notes ?? '',
    });
    setOtherIntervention(item.catalog_item_id ? '' : item.intervention_type);
    if (item.catalog_item_id && !visibleCatalog.some((c) => c.id === item.catalog_item_id)) setShowAll(true);
  };

  if (loading) return <LoadingState label="Cargando intervenciones..." />;

  const arm = patient?.center?.study_arm ?? null;
  const isOtherIntervention = form.catalog_choice === OTHER_INTERVENTION_CODE;
  const selectedCatalogItem = isOtherIntervention ? null : catalogById.get(form.catalog_choice) ?? null;

  if (arm === 'standard') {
    return (
      <div className="page-stack">
        <section className="card">
          <h1>Registro de intervenciones</h1>
          <VisitTabs visitId={visitId} active="interventions" />
          <Notice tone="info" title={STUDY_ARM_LABEL.standard}>
            <p>Registre lo que ha hecho en esta visita seleccionándolo del listado. En los centros de atención farmacéutica estándar no se estratifica.</p>
          </Notice>
        </section>
        <UsualCareInterventionsPanel visitId={visitId} />
        <div className="actions-inline section-footer-actions">
          {visitPatientId ? <Link to={`/patients/${visitPatientId}`}>Volver a paciente</Link> : null}
        </div>
      </div>
    );
  }

  if (arm !== 'cmo') {
    return (
      <div className="page-stack">
        <section className="card">
          <h1>Registro de intervenciones</h1>
          <VisitTabs visitId={visitId} active="interventions" />
          <Notice tone="danger" title="Centro sin cohorte asignada">
            <p>El centro de este paciente no tiene asignada la cohorte del estudio. Coordinación debe asignarla antes de registrar intervenciones.</p>
          </Notice>
          {errorMessage ? <ErrorState title="No se pudo cargar la visita" message={errorMessage} /> : null}
          <div className="actions-inline section-footer-actions">
            {visitPatientId ? <Link to={`/patients/${visitPatientId}`}>Volver a paciente</Link> : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Registro de intervenciones</h1>
        <VisitTabs visitId={visitId} active="interventions" />

        {currentLevel ? (
          <div className="visit-score-summary">
            <span className="visit-context-label">
              {currentLevel.own ? 'Nivel CMO de esta visita' : `Nivel CMO vigente (última estratificación${currentLevel.date ? ` del ${currentLevel.date}` : ''})`}
            </span>
            <CmoLevelBadge level={currentLevel.level} score={currentLevel.score} />
          </div>
        ) : (
          <Notice tone="info" className="visit-score-notice">
            <p>
              El paciente no tiene estratificación previa: se muestra el catálogo completo y debes seleccionar el nivel CMO vinculado.{' '}
              <Link to={`/visits/${visitId}/stratification`}>Estratificar</Link>
            </p>
          </Notice>
        )}

        {currentLevel ? <ProtocolPackage level={currentLevel.level} /> : null}
      </section>

      <section className="card" aria-labelledby="intervention-form-title">
        <SectionHeader
          id="intervention-form-title"
          title="Nueva intervención"
          description={`Catálogo ${INTERVENTION_CATALOG_VERSION} (borrador literal de la fuente, pendiente de validación IP).`}
        />
        <div className="catalog-toolbar">
          <label className="checkbox-row">
            <input type="checkbox" checked={showAll || !currentLevel} disabled={!currentLevel} onChange={(e) => setShowAll(e.target.checked)} />
            Ver todas las intervenciones del catálogo
          </label>
          <span className="help-text">
            {showAll || !currentLevel
              ? `${visibleCatalog.length} tarjetas`
              : `${visibleCatalog.length} tarjetas recomendadas para ${CMO_LEVEL_META[currentLevel.level].shortLabel}`}
          </span>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Intervención
            <select required value={form.catalog_choice} onChange={(e) => handleCatalogSelection(e.target.value)}>
              <option value="">Seleccionar intervención</option>
              {Object.entries(INTERVENTION_CATEGORY_LABEL).map(([category, label]) => {
                const options = visibleCatalog.filter((item) => item.category === category);
                if (options.length === 0) return null;
                return (
                  <optgroup key={category} label={label}>
                    {options.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
              <option value={OTHER_INTERVENTION_CODE}>Otra intervención (texto libre)</option>
            </select>
          </label>

          {selectedCatalogItem ? (
            <p className="help-text">
              Código {selectedCatalogItem.code} · pilar {CMO_PILLAR_LABEL[selectedCatalogItem.cmo_pillar]} · disponibilidad{' '}
              {INTERVENTION_TIER_LABEL[selectedCatalogItem.tier ?? ''] ?? '-'} · recomendada para niveles {selectedCatalogItem.recommended_levels.join(', ')}
            </p>
          ) : null}

          {isOtherIntervention ? (
            <label>
              Otra intervención
              <input required value={otherIntervention} onChange={(e) => setOtherIntervention(e.target.value)} />
            </label>
          ) : null}

          <label>
            Pilar CMO principal
            <select
              required
              value={form.cmo_pillar}
              disabled={Boolean(selectedCatalogItem)}
              onChange={(e) => setForm((p) => ({ ...p, cmo_pillar: e.target.value as CmoPillar | '' }))}
            >
              <option value="">Seleccionar pilar CMO</option>
              {CMO_PILLAR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid-2">
            <label>
              Prioridad de la intervención
              <select value={form.priority_level} onChange={(e) => setForm((p) => ({ ...p, priority_level: e.target.value as PriorityLevel }))}>
                <option value="high">{INTERVENTION_PRIORITY_LABEL.high}</option>
                <option value="medium">{INTERVENTION_PRIORITY_LABEL.medium}</option>
                <option value="low">{INTERVENTION_PRIORITY_LABEL.low}</option>
              </select>
            </label>
            <label>
              Nivel CMO vinculado
              <select required value={form.linked_to_cmo_level} onChange={(e) => setForm((p) => ({ ...p, linked_to_cmo_level: e.target.value }))}>
                <option value="" disabled>Seleccionar nivel</option>
                {([1, 2, 3] as const).map((level) => (
                  <option key={level} value={String(level)}>{CMO_LEVEL_META[level].label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="checkbox-row">
            <input type="checkbox" checked={form.delivered} onChange={(e) => setForm((p) => ({ ...p, delivered: e.target.checked }))} />
            Intervención entregada
          </label>
          <label>
            Resultado
            <input value={form.outcome} onChange={(e) => setForm((p) => ({ ...p, outcome: e.target.value }))} />
          </label>
          <label>
            Notas
            <textarea rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Guardando...' : editingInterventionId ? 'Guardar cambios' : 'Guardar intervención'}</button>
            {editingInterventionId ? (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancelar edición
              </button>
            ) : null}
          </div>
        </form>

        {errorMessage ? <ErrorState title="No se pudo guardar/cargar intervenciones" message={errorMessage} /> : null}
      </section>

      <section className="card" aria-labelledby="visit-interventions-title">
        <SectionHeader id="visit-interventions-title" title="Intervenciones de la visita" description={`${items.length} registrada(s)`} />
        {items.length === 0 ? (
          <p className="empty-inline">Sin intervenciones registradas para esta visita.</p>
        ) : (
          <ul className="intervention-list">
            {items.map((item) => {
              const pillar = normalizeCmoPillar(item.intervention_domain);
              return (
                <li key={item.id}>
                  <div className="intervention-main">
                    <p className="intervention-title">{item.intervention_type}</p>
                    <div className="intervention-meta">
                      <span><strong>Prioridad:</strong> {item.priority_level ? INTERVENTION_PRIORITY_LABEL[item.priority_level] : '-'}</span>
                      <span><strong>Pilar CMO:</strong> {pillar ? CMO_PILLAR_LABEL[pillar] : 'No asignado'}</span>
                      <span><strong>Nivel vinculado:</strong> {toCmoLevel(item.linked_to_cmo_level) ? CMO_LEVEL_META[toCmoLevel(item.linked_to_cmo_level) as CmoLevel].shortLabel : '-'}</span>
                      <span><strong>Catálogo:</strong> {item.catalog_code ? `${item.catalog_code} · ${item.catalog_version}` : 'Texto libre'}</span>
                      <StatusBadge tone={item.delivered ? 'positive' : 'neutral'}>{item.delivered ? 'Entregada' : 'Pendiente'}</StatusBadge>
                    </div>
                    {item.outcome?.trim() ? <p className="intervention-note"><strong>Resultado:</strong> {item.outcome.trim()}</p> : null}
                    {item.notes?.trim() ? <p className="intervention-note"><strong>Notas:</strong> {item.notes.trim()}</p> : null}
                  </div>
                  <button type="button" className="secondary button-sm" onClick={() => handleEditIntervention(item)}>Editar intervención</button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="actions-inline section-footer-actions">
          <Link to={`/visits/${visitId}/stratification`}>Volver a estratificación</Link>
          {visitPatientId ? <Link to={`/patients/${visitPatientId}`}>Volver a paciente</Link> : null}
        </div>
      </section>
    </div>
  );
}
