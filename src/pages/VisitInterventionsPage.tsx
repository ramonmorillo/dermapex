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

const INTERVENTION_CATALOG: InterventionCatalogItem[] = [
  // NIVEL 3 · BASAL
  { code: 'L3-SFT-01', label: 'Revisar y validar el tratamiento cardiovascular para garantizar su adecuación, seguridad y efectividad dentro de los plazos de cumplimiento clínico sugeridos por las guías, registrando y comunicando las reacciones adversas a medicamentos observadas.', domain: 'Seguimiento farmacoterapéutico', cmo_pillar: 'oportunidad', min_level: 3 },
  { code: 'L3-SFT-02', label: 'Monitorizar la adherencia del paciente a las prescripciones médicas y establecer estrategias efectivas de mejora mediante educación, apoyo conductual, atención colaborativa y gestión de casos, adaptadas a las características específicas de la enfermedad cardiovascular.', domain: 'Seguimiento farmacoterapéutico', cmo_pillar: 'motivacion', min_level: 3 },
  { code: 'L3-SFT-03', label: 'Conciliar y revisar la medicación concomitante para identificar y gestionar posibles interacciones farmacológicas, ofreciendo alternativas terapéuticas cuando sea necesario.', domain: 'Seguimiento farmacoterapéutico', cmo_pillar: 'capacidad', min_level: 3 },
  { code: 'L3-EDU-01', label: 'Promover un paciente activo e informado que comparta la responsabilidad sobre los resultados del tratamiento, proporcionando información básica sobre las terapias cardiovasculares y el manejo de problemas relacionados con la medicación.', domain: 'Educación sanitaria y promoción de estilos de vida saludables', cmo_pillar: 'motivacion', min_level: 3 },
  { code: 'L3-EDU-02', label: 'Proporcionar información detallada sobre los tratamientos y la enfermedad cardiovascular, resolviendo las dudas del paciente sobre su situación clínica.', domain: 'Educación sanitaria y promoción de estilos de vida saludables', cmo_pillar: 'capacidad', min_level: 3 },
  { code: 'L3-EDU-03', label: 'Ofrecer educación sanitaria general sobre estilos de vida cardiosaludables, control de factores de riesgo, uso correcto de la medicación y cumplimiento de objetivos terapéuticos mediante recursos web de farmacia o folletos para pacientes.', domain: 'Educación sanitaria y promoción de estilos de vida saludables', cmo_pillar: 'capacidad', min_level: 3 },
  { code: 'L3-EDU-04', label: 'Fomentar el uso de herramientas de autocuidado, proporcionando recursos web y aplicaciones informativas para la formación del paciente y la confirmación de cambios reales en el estilo de vida.', domain: 'Educación sanitaria y promoción de estilos de vida saludables', cmo_pillar: 'capacidad', min_level: 3 },
  { code: 'L3-EDU-05', label: 'Reforzar la educación sobre prevención y adherencia, destacando el impacto de la falta de adherencia sobre el aumento del riesgo cardiovascular.', domain: 'Educación sanitaria y promoción de estilos de vida saludables', cmo_pillar: 'motivacion', min_level: 3 },
  { code: 'L3-CRF-01', label: 'Control de la presión arterial.', domain: 'Cribado y detección de factores de riesgo cardiovascular', cmo_pillar: 'oportunidad', min_level: 3 },
  { code: 'L3-CRF-02', label: 'Medición del perfil lipídico.', domain: 'Cribado y detección de factores de riesgo cardiovascular', cmo_pillar: 'oportunidad', min_level: 3 },
  { code: 'L3-CRF-03', label: 'Cuantificación de HbA1c.', domain: 'Cribado y detección de factores de riesgo cardiovascular', cmo_pillar: 'oportunidad', min_level: 3 },
  { code: 'L3-CRF-05', label: 'Monitorización de glucosa', domain: 'Cribado y detección de factores de riesgo cardiovascular', cmo_pillar: 'oportunidad', min_level: 3 },
  { code: 'L3-CRF-04', label: 'Cribado de fibrilación auricular en pacientes mayores de 65 años.', domain: 'Cribado y detección de factores de riesgo cardiovascular', cmo_pillar: 'oportunidad', min_level: 3 },
  { code: 'L3-CET-01', label: 'Identificar la etapa de cambio del paciente —precontemplación, contemplación, preparación, acción o mantenimiento— utilizando el modelo transteórico.', domain: 'Cesación tabáquica', cmo_pillar: 'motivacion', min_level: 3 },
  { code: 'L3-CET-02', label: 'Aplicar técnicas de entrevista motivacional para aumentar la implicación del paciente y resolver la ambivalencia hacia el abandono del tabaco.', domain: 'Cesación tabáquica', cmo_pillar: 'motivacion', min_level: 3 },
  { code: 'L3-CET-03', label: 'Entregar materiales educativos básicos sobre los riesgos del tabaco y de los nuevos sistemas de administración de nicotina.', domain: 'Cesación tabáquica', cmo_pillar: 'capacidad', min_level: 3 },
  { code: 'L3-ADH-01', label: 'Evaluar de forma rutinaria la adherencia mediante herramientas validadas, como el cuestionario Morisky-Green-Levine, combinándolo con la validación de los registros de dispensación mediante sistemas electrónicos.', domain: 'Mejora de la adherencia terapéutica', cmo_pillar: 'oportunidad', min_level: 3 },
  { code: 'L3-ADH-02', label: 'Proporcionar información básica sobre la relación crítica entre adherencia terapéutica y prevención de eventos cardiovasculares secundarios.', domain: 'Mejora de la adherencia terapéutica', cmo_pillar: 'capacidad', min_level: 3 },

  // NIVEL 2 · PRIORIDAD INTERMEDIA (adiciones)
  { code: 'L2-SFT-01', label: 'Monitorizar y tomar decisiones basadas en resultados comunicados por el paciente y medidas de experiencia del paciente utilizadas para el seguimiento.', domain: 'Seguimiento farmacoterapéutico', cmo_pillar: 'oportunidad', min_level: 2 },
  { code: 'L2-SFT-02', label: 'Mantener contacto adicional con el paciente entre visitas programadas mediante teleasistencia y para la planificación de futuras citas.', domain: 'Seguimiento farmacoterapéutico', cmo_pillar: 'oportunidad', min_level: 2 },
  { code: 'L2-EDU-01', label: 'Desarrollar materiales adaptados para cada paciente y cuidador, como horarios de medicación, diarios del paciente u otros recursos personalizados.', domain: 'Educación sanitaria y promoción de estilos de vida saludables', cmo_pillar: 'capacidad', min_level: 2 },
  { code: 'L2-CRF-01', label: 'Proporcionar servicios de monitorización ambulatoria de presión arterial o automedida domiciliaria de la presión arterial.', domain: 'Cribado y detección de factores de riesgo cardiovascular', cmo_pillar: 'oportunidad', min_level: 2 },
  { code: 'L2-CET-01', label: 'Diseñar y entregar guías personalizadas de cesación tabáquica y diarios del paciente para registrar desencadenantes y progresos.', domain: 'Cesación tabáquica', cmo_pillar: 'capacidad', min_level: 2 },
  { code: 'L2-CET-02', label: 'Implicar a familiares o cuidadores en el plan de abandono del tabaco para favorecer un entorno de apoyo.', domain: 'Cesación tabáquica', cmo_pillar: 'oportunidad', min_level: 2 },
  { code: 'L2-COO-01', label: 'Establecer comunicación bidireccional con el médico de atención primaria para homogeneizar objetivos.', domain: 'Coordinación con atención primaria/equipo asistencial', cmo_pillar: 'oportunidad', min_level: 2 },
  { code: 'L2-COO-02', label: 'Abordar determinantes sociales de la salud cuando se detecten desigualdades sociales.', domain: 'Coordinación con atención primaria/equipo asistencial', cmo_pillar: 'oportunidad', min_level: 2 },
  { code: 'L2-ADH-01', label: 'Realizar entrevistas clínicas para identificar barreras específicas a la adherencia, como polifarmacia, efectos adversos o pautas de administración complejas.', domain: 'Mejora de la adherencia terapéutica', cmo_pillar: 'motivacion', min_level: 2 },
  { code: 'L2-ADH-02', label: 'Proporcionar calendarios de medicación y registros personalizados para simplificar la rutina de administración y reducir olvidos.', domain: 'Mejora de la adherencia terapéutica', cmo_pillar: 'capacidad', min_level: 2 },
  { code: 'L2-ADH-03', label: 'Programar seguimientos telefónicos o recordatorios automatizados para reforzar la adherencia y monitorizar la estabilidad terapéutica entre visitas presenciales.', domain: 'Mejora de la adherencia terapéutica', cmo_pillar: 'oportunidad', min_level: 2 },

  // NIVEL 1 · MÁXIMA PRIORIDAD (adiciones)
  { code: 'L1-SFT-01', label: 'Implicar al paciente en el plan farmacoterapéutico compartiendo el progreso hacia sus objetivos clínicos y estableciendo acciones acordadas.', domain: 'Seguimiento farmacoterapéutico', cmo_pillar: 'motivacion', min_level: 1 },
  { code: 'L1-SFT-02', label: 'Desarrollar programas estructurados para la detección, prevención y manejo de factores de riesgo específicos, como hipertensión, dislipemia o diabetes, utilizando herramientas de telemedicina.', domain: 'Seguimiento farmacoterapéutico', cmo_pillar: 'oportunidad', min_level: 1 },
  { code: 'L1-EDU-01', label: 'Diseñar y proporcionar recursos personalizados para pacientes y cuidadores, incluidos calendarios de medicación y registros del paciente.', domain: 'Educación sanitaria y promoción de estilos de vida saludables', cmo_pillar: 'capacidad', min_level: 1 },
  { code: 'L1-CET-01', label: 'Proporcionar consejo firme, personalizado y no enjuiciador sobre los beneficios de abandonar el tabaco, enfatizando su impacto en la reducción de eventos cardiovasculares.', domain: 'Cesación tabáquica', cmo_pillar: 'motivacion', min_level: 1 },
  { code: 'L1-CET-02', label: 'Implicar al paciente en un plan estructurado de cesación, incluyendo la revisión y validación de tratamientos farmacológicos como terapia sustitutiva con nicotina, vareniclina o bupropión, para garantizar adecuación y seguridad.', domain: 'Cesación tabáquica', cmo_pillar: 'oportunidad', min_level: 1 },
  { code: 'L1-CET-03', label: 'Utilizar tecnologías de la información y herramientas de telemedicina para monitorizar en tiempo real síntomas de abstinencia y proporcionar apoyo inmediato en situaciones de alto riesgo de recaída.', domain: 'Cesación tabáquica', cmo_pillar: 'oportunidad', min_level: 1 },
  { code: 'L1-CET-04', label: 'Establecer canales de comunicación rápida con el médico de atención primaria para comunicar reacciones adversas o ajustar el tratamiento según la evolución del paciente.', domain: 'Cesación tabáquica', cmo_pillar: 'oportunidad', min_level: 1 },
  { code: 'L1-CET-05', label: 'Planificar visitas intensivas de seguimiento cada 2-3 meses y contactos suplementarios por teleasistencia para consolidar la fase de mantenimiento.', domain: 'Cesación tabáquica', cmo_pillar: 'oportunidad', min_level: 1 },
  { code: 'L1-COO-01', label: 'Establecer canales de comunicación rápida con el equipo asistencial para abordar reacciones adversas a medicamentos.', domain: 'Coordinación con atención primaria/equipo asistencial', cmo_pillar: 'oportunidad', min_level: 1 },
  { code: 'L1-COO-02', label: 'Desarrollar planes de actuación asistencial interniveles para transiciones clínicas complejas.', domain: 'Coordinación con atención primaria/equipo asistencial', cmo_pillar: 'oportunidad', min_level: 1 },
  { code: 'L1-ADH-01', label: 'Implementar sistemas personalizados de dosificación para organizar regímenes farmacoterapéuticos complejos, minimizar errores de medicación y mejorar la seguridad en pacientes con alta polimedicación.', domain: 'Mejora de la adherencia terapéutica', cmo_pillar: 'oportunidad', min_level: 1 },
];

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
            <span className="visit-context-label">Puntuación CMO-RCV guardada para esta visita</span>
            <CmoLevelBadge level={cmoScore.priority} score={cmoScore.score} />
          </div>
        ) : (
          <Notice tone="info" className="visit-score-notice">
            <p>
              Sin puntuación CMO registrada para esta visita.{' '}
              <Link to={`/visits/${visitId}/stratification`}>Completar estratificación</Link>
            </p>
            <p>
              {inheritedLevel
                ? `Nivel CMO vinculado propuesto: ${CMO_LEVEL_META[inheritedLevel.level].label} (última estratificación${inheritedLevel.date ? ` del ${inheritedLevel.date}` : ''}).`
                : 'El paciente no tiene estratificación previa: selecciona el nivel CMO vinculado.'}
            </p>
          </Notice>
        )}

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
          <Link to={`/visits/${visitId}/stratification`}>Volver a estratificación</Link>
          {visitPatientId ? <Link to={`/patients/${visitPatientId}`}>Volver a paciente</Link> : null}
        </div>
      </section>
    </div>
  );
}
