import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { VisitTabs } from '../components/common/VisitTabs';
import { CmoLevelBadge } from '../components/ui/CmoLevelBadge';
import { Notice } from '../components/ui/Notice';
import { SectionHeader } from '../components/ui/SectionHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CMO_LEVEL_META } from '../constants/cmoLevels';
import { getCmoScoreByVisit, listCmoScoresByPatient, type CmoScoreRecord } from '../services/cmoScoreService';
import {
  createIntervention,
  updateIntervention,
  listInterventionsByVisit,
  type Intervention,
  type PriorityLevel,
} from '../services/interventionService';
import { getVisitById } from '../services/visitService';
import { pickReferenceStratification } from '../utils/referenceStratification';

type CmoPillar = 'capacidad' | 'motivacion' | 'oportunidad';
type CmoLevel = 1 | 2 | 3;

type InterventionCatalogItem = {
  code: string;
  label: string;
  domain: string;
  cmo_pillar: CmoPillar;
  min_level: CmoLevel;
};

const OTHER_INTERVENTION_CODE = '__other__';

// PENDIENTE DERMAPEX: catálogo de intervenciones CMO vacío a propósito.
// El catálogo heredado de IRIS estaba redactado para riesgo cardiovascular (cribado de FRCV,
// presión arterial, perfil lipídico, HbA1c, cesación tabáquica orientada a eventos CV…) y se ha
// retirado. Se poblará con el catálogo oficial CMO-DERMAPEX (código, texto, pilar CMO, nivel
// mínimo) a partir del protocolo. Mientras tanto se pueden registrar intervenciones en texto
// libre con pilar CMO y nivel vinculado, conservando toda la trazabilidad.
const INTERVENTION_CATALOG: InterventionCatalogItem[] = [];

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


function normalizeCmoPillar(value: string | null | undefined): CmoPillar | '' {
  if (!value) return '';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'capacidad') return 'capacidad';
  if (normalized === 'motivación' || normalized === 'motivacion') return 'motivacion';
  if (normalized === 'oportunidad') return 'oportunidad';
  return '';
}

function toDbCmoPillar(value: CmoPillar | ''): string | null {
  if (!value) return null;
  return CMO_PILLAR_LABEL[value];
}

function findCatalogItemForIntervention(item: Intervention): InterventionCatalogItem | undefined {
  return INTERVENTION_CATALOG.find((catalogItem) => catalogItem.label === item.intervention_type);
}

function getInterventionPillar(item: Intervention): CmoPillar | '' {
  const savedDomainPillar = normalizeCmoPillar(item.intervention_domain);
  if (savedDomainPillar) return savedDomainPillar;
  return '';
}

export function VisitInterventionsPage() {
  const { visitId = '' } = useParams();
  const [visitPatientId, setVisitPatientId] = useState('');
  const [cmoScore, setCmoScore] = useState<CmoScoreRecord | null>(null);
  const [inheritedLevel, setInheritedLevel] = useState<{ level: CmoLevel; date: string | null } | null>(null);
  const [items, setItems] = useState<Intervention[]>([]);
  const [form, setForm] = useState({
    intervention_code: '',
    intervention_type: '',
    intervention_domain: '',
    cmo_pillar: '' as CmoPillar | '',
    priority_level: 'low' as PriorityLevel,
    delivered: true,
    // No default level: it must come from the visit's (or latest prior) stratification or be chosen explicitly.
    linked_to_cmo_level: '',
    outcome: '',
    notes: '',
  });
  const [otherIntervention, setOtherIntervention] = useState('');
  const [editingInterventionId, setEditingInterventionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cmoPriorityToInterventionPriority: Record<CmoLevel, PriorityLevel> = {
    1: 'high',
    2: 'medium',
    3: 'low',
  };

  const interventionPriorityLabel: Record<PriorityLevel, string> = {
    high: '1 · Prioridad',
    medium: '2 · Intermedio',
    low: '3 · Basal',
  };

  useEffect(() => {
    void (async () => {
      const { data: visitScore } = await getCmoScoreByVisit(visitId);
      let data = visitScore;
      if (visitScore) {
        setCmoScore(visitScore);
      } else {
        // Visit without its own score: the patient's current level is the latest prior stratification.
        const { data: visit } = await getVisitById(visitId);
        if (!visit?.patient_id) return;
        const { data: history } = await listCmoScoresByPatient(visit.patient_id);
        const reference = pickReferenceStratification(history, visit.visit_date ?? visit.scheduled_date);
        if (!reference) return;
        data = reference;
        setInheritedLevel({ level: Number(reference.priority) as CmoLevel, date: reference.visit_date ?? reference.scheduled_date });
      }
      if (data) {
        const level = Number(data.priority) as CmoLevel;
        setForm({
          intervention_code: '',
          intervention_type: '',
          intervention_domain: '',
          cmo_pillar: '',
          priority_level: cmoPriorityToInterventionPriority[level] ?? 'low',
          delivered: true,
          linked_to_cmo_level: String(level),
          outcome: '',
          notes: '',
        });
      }
    })();
  }, [visitId]);

  const linkedLevel = Number(form.linked_to_cmo_level) as CmoLevel;

  const visibleCatalog = useMemo(() => {
    const uniqueByCode = INTERVENTION_CATALOG.reduce<Map<string, InterventionCatalogItem>>((acc, item) => {
      if (!acc.has(item.code)) acc.set(item.code, item);
      return acc;
    }, new Map());

    return Array.from(uniqueByCode.values()).filter((item) => item.min_level >= linkedLevel);
  }, [linkedLevel]);

  async function loadInterventions() {
    const [visitRes, listRes] = await Promise.all([getVisitById(visitId), listInterventionsByVisit(visitId)]);
    if (visitRes.data?.patient_id) setVisitPatientId(visitRes.data.patient_id);
    setItems(listRes.data);
    setErrorMessage(listRes.errorMessage);
  }

  useEffect(() => {
    void loadInterventions();
  }, [visitId]);

  const handleInterventionSelection = (selectedCode: string) => {
    if (selectedCode === OTHER_INTERVENTION_CODE) {
      setForm((prev) => ({
        ...prev,
        intervention_code: selectedCode,
        intervention_type: '',
        intervention_domain: '',
        cmo_pillar: '',
      }));
      return;
    }

    const selected = visibleCatalog.find((item) => item.code === selectedCode);
    setForm((prev) => ({
      ...prev,
      intervention_code: selectedCode,
      intervention_type: selected?.label ?? '',
      intervention_domain: selected?.cmo_pillar ? toDbCmoPillar(selected.cmo_pillar) ?? '' : '',
      cmo_pillar: selected?.cmo_pillar ?? '',
    }));
    setOtherIntervention('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    const isOtherIntervention = form.intervention_code === OTHER_INTERVENTION_CODE;
    const interventionTypeToSave = isOtherIntervention ? otherIntervention.trim() : form.intervention_type;

    if (!interventionTypeToSave) {
      setErrorMessage('Selecciona una intervención del catálogo o escribe "Otra intervención".');
      setSaving(false);
      return;
    }

    const payload = {
      intervention_type: interventionTypeToSave,
      intervention_domain: toDbCmoPillar(form.cmo_pillar),
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

    setForm((prev) => ({
      ...prev,
      intervention_code: '',
      intervention_type: '',
      intervention_domain: '',
      cmo_pillar: '',
      outcome: '',
      notes: '',
    }));
    setOtherIntervention('');
    setEditingInterventionId(null);
    setSaving(false);
    await loadInterventions();
  };


  const handleEditIntervention = (item: Intervention) => {
    const catalogItem = findCatalogItemForIntervention(item);
    const pillar = getInterventionPillar(item);

    setEditingInterventionId(item.id);
    setForm({
      intervention_code: catalogItem?.code ?? OTHER_INTERVENTION_CODE,
      intervention_type: item.intervention_type,
      intervention_domain: item.intervention_domain ?? '',
      cmo_pillar: pillar,
      priority_level: item.priority_level ?? 'low',
      delivered: item.delivered ?? true,
      linked_to_cmo_level: String(item.linked_to_cmo_level ?? catalogItem?.min_level ?? 3),
      outcome: item.outcome ?? '',
      notes: item.notes ?? '',
    });
    setOtherIntervention(catalogItem ? '' : item.intervention_type);
  };

  const isOtherIntervention = form.intervention_code === OTHER_INTERVENTION_CODE;

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Registro de intervenciones</h1>
        <VisitTabs visitId={visitId} active="interventions" />

        {cmoScore ? (
          <div className="visit-score-summary">
            <span className="visit-context-label">Puntuación CMO guardada para esta visita</span>
            <CmoLevelBadge level={cmoScore.priority} score={cmoScore.score} />
          </div>
        ) : (
          <Notice tone="info" className="visit-score-notice">
            <p>
              Sin puntuación CMO registrada para esta visita.{' '}
              <Link to={`/visits/${visitId}/stratification`}>Ver datos clínicos</Link>
            </p>
            <p>
              {inheritedLevel
                ? `Nivel CMO vinculado propuesto: ${CMO_LEVEL_META[inheritedLevel.level].label} (última estratificación${inheritedLevel.date ? ` del ${inheritedLevel.date}` : ''}).`
                : 'El paciente no tiene estratificación previa: selecciona el nivel CMO vinculado.'}
            </p>
          </Notice>
        )}

        <Notice tone="warning">
          <p>
            Catálogo de intervenciones CMO-DERMAPEX pendiente de definir a partir del protocolo. Registra las
            intervenciones como «Otra intervención (texto libre)» indicando pilar CMO y nivel vinculado.
          </p>
        </Notice>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Tipo de intervención
            <select required value={form.intervention_code} onChange={(e) => handleInterventionSelection(e.target.value)}>
              <option value="">Seleccionar intervención</option>
              {visibleCatalog.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
              <option value={OTHER_INTERVENTION_CODE}>Otra intervención (texto libre)</option>
            </select>
          </label>

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
              onChange={(e) => setForm((p) => ({
                ...p,
                cmo_pillar: e.target.value as CmoPillar | '',
                intervention_domain: toDbCmoPillar(e.target.value as CmoPillar | '') ?? '',
              }))}
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
              Prioridad
              <select value={form.priority_level} onChange={(e) => setForm((p) => ({ ...p, priority_level: e.target.value as PriorityLevel }))}>
                <option value="high">1 · Prioridad</option>
                <option value="medium">2 · Intermedio</option>
                <option value="low">3 · Basal</option>
              </select>
            </label>
            <label>
              Nivel CMO vinculado
              <select required value={form.linked_to_cmo_level} onChange={(e) => setForm((p) => ({ ...p, linked_to_cmo_level: e.target.value }))}>
                <option value="" disabled>Seleccionar nivel</option>
                <option value="1">1 · Prioridad</option>
                <option value="2">2 · Intermedio</option>
                <option value="3">3 · Basal</option>
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
              <button type="button" className="secondary" onClick={() => {
                setEditingInterventionId(null);
                setForm((prev) => ({ ...prev, intervention_code: '', intervention_type: '', intervention_domain: '', cmo_pillar: '', outcome: '', notes: '' }));
                setOtherIntervention('');
              }}>
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
            {items.map((item) => (
              <li key={item.id}>
                <div className="intervention-main">
                  <p className="intervention-title">{item.intervention_type}</p>
                  <div className="intervention-meta">
                    <span>{item.priority_level ? interventionPriorityLabel[item.priority_level] : '-'}</span>
                    <span><strong>Pilar CMO:</strong> {getInterventionPillar(item) ? CMO_PILLAR_LABEL[getInterventionPillar(item) as CmoPillar] : 'No asignado'}</span>
                    <StatusBadge tone={item.delivered ? 'positive' : 'neutral'}>{item.delivered ? 'Entregada' : 'Pendiente'}</StatusBadge>
                  </div>
                  {item.outcome?.trim() ? <p className="intervention-note"><strong>Resultado:</strong> {item.outcome.trim()}</p> : null}
                  {item.notes?.trim() ? <p className="intervention-note"><strong>Notas:</strong> {item.notes.trim()}</p> : null}
                </div>
                <button type="button" className="secondary button-sm" onClick={() => handleEditIntervention(item)}>Editar intervención</button>
              </li>
            ))}
          </ul>
        )}
        <div className="actions-inline section-footer-actions">
          <Link to={`/visits/${visitId}/stratification`}>Volver a datos clínicos</Link>
          {visitPatientId ? <Link to={`/patients/${visitPatientId}`}>Volver a paciente</Link> : null}
        </div>
      </section>
    </div>
  );
}
