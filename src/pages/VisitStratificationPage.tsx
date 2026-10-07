import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { VisitTabs } from '../components/common/VisitTabs';
import { CmoLevelBadge } from '../components/ui/CmoLevelBadge';
import { CmoResultPanel } from '../components/ui/CmoResultPanel';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { SectionHeader } from '../components/ui/SectionHeader';
import { ProtocolPackage } from '../components/ui/ProtocolPackage';
import { CMO_LEVEL_META, toCmoLevel } from '../constants/cmoLevels';
import {
  AGE_GROUP_CODE,
  CMO_ANSWER_FIELDS,
  CMO_BLOCKS,
  CMO_INFORMATIVE_FIELDS,
  type CmoAnswerFieldDefinition,
} from '../constants/cmoDermapexModel';
import {
  COMPARATOR_SAVED_MESSAGE,
  DERMAPEX_DECISIONS,
  RECENT_MEDICATION_PROTOCOL_DISCREPANCY,
  STRATIFICATION_REASONS,
  getStratificationReasonLabel,
  type StratificationReason,
} from '../constants/dermapexStudyConfig';
import { getSexLabel } from '../constants/enums';
import { ageToGroup, CMO_ENGINE_VERSION, CMO_MODEL_VERSION, describeAnswer, UNKNOWN } from '../services/cmoScoringEngine';
import {
  canViewCmoResults,
  computeDraft,
  draftAnswersFromItems,
  getVisitStratification,
  missingAnswerCodes,
  prefillSexAnswer,
  saveCmoStratification,
  type StratificationItemValueRow,
  type StratificationRegistryRow,
} from '../services/cmoStratificationService';
import { getPatientById, type Patient } from '../services/patientService';
import { getCurrentProfile, type CurrentProfile } from '../services/profileService';
import { getVisitById, type Visit } from '../services/visitService';

type Answers = Record<string, string | undefined>;

const UNKNOWN_LABEL = 'Desconocido';

function labelForCode(code: string): string {
  if (code === AGE_GROUP_CODE) return 'Grupo de edad';
  return CMO_ANSWER_FIELDS.find((f) => f.code === code)?.label ?? CMO_INFORMATIVE_FIELDS.find((f) => f.code === code)?.label ?? code;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Estratificación CMO-DERMAPEX de una visita (/visits/:visitId/stratification).
 *
 * Permitida en cualquier visita con motivo obligatorio (D6). Cada variable se responde Sí / No /
 * Desconocido (D1); solo puntúa lo confirmado por el farmacéutico. Comportamiento por cohorte (D5):
 * los centros del brazo estándar registran las variables pero no ven puntuación, nivel, paquete ni
 * catálogo; la base de datos lo impone por RLS y vistas enmascaradas.
 */
export function VisitStratificationPage() {
  const { visitId = '' } = useParams();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [registry, setRegistry] = useState<StratificationRegistryRow | null>(null);
  const [items, setItems] = useState<StratificationItemValueRow[]>([]);
  const [reason, setReason] = useState<StratificationReason | ''>('');
  const [answers, setAnswers] = useState<Answers>({});
  const [informative, setInformative] = useState<Answers>({});
  const [sexPrefilled, setSexPrefilled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  async function loadSaved() {
    const saved = await getVisitStratification(visitId);
    setRegistry(saved.registry);
    setItems(saved.items);
    return saved;
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setLoading(true);
      const visitResult = await getVisitById(visitId);
      if (!mounted) return;
      if (!visitResult.data) {
        setErrorMessage(visitResult.errorMessage ?? 'Visita no encontrada.');
        setLoading(false);
        return;
      }
      setVisit(visitResult.data);
      const [patientResult, profileResult] = await Promise.all([getPatientById(visitResult.data.patient_id), getCurrentProfile()]);
      const saved = await loadSaved();
      if (!mounted) return;
      setPatient(patientResult.data);
      setProfile(profileResult.data);
      if (saved.registry && saved.items.length > 0) {
        const restored = draftAnswersFromItems(saved.items);
        setAnswers(restored.answers);
        setInformative(restored.informative);
        setReason(saved.registry.stratification_reason ?? '');
      } else {
        const sex = prefillSexAnswer(patientResult.data?.sex);
        if (sex) {
          setAnswers({ sexo_mujer: sex });
          setSexPrefilled(true);
        }
      }
      setErrorMessage(patientResult.errorMessage ?? saved.errorMessage ?? null);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [visitId]);

  const arm = patient?.center?.study_arm ?? null;
  const showResults = canViewCmoResults(arm, profile?.role);
  const age = patient?.age_at_inclusion ?? null;
  const ageGroup = ageToGroup(age);

  const preview = useMemo(() => computeDraft({ age, answers, informative }), [age, answers, informative]);
  const missing = useMemo(() => missingAnswerCodes({ answers, informative }), [answers, informative]);
  const answeredCount = CMO_ANSWER_FIELDS.length + CMO_INFORMATIVE_FIELDS.length - missing.length;
  const totalToAnswer = CMO_ANSWER_FIELDS.length + CMO_INFORMATIVE_FIELDS.length;
  const canSave = Boolean(arm) && Boolean(reason) && missing.length === 0 && !saving;

  const setAnswer = (code: string, value: string) => {
    setSavedNotice(null);
    if (code === 'sexo_mujer') setSexPrefilled(false);
    setAnswers((prev) => ({ ...prev, [code]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setSavedNotice(null);
    const result = await saveCmoStratification({ visitId, reason, age, answers, informative });
    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setSaving(false);
      return;
    }
    await loadSaved();
    setSavedNotice(showResults ? 'Estratificación guardada.' : COMPARATOR_SAVED_MESSAGE);
    setSaving(false);
  };

  if (loading) return <LoadingState label="Cargando estratificación..." />;

  // Decisión IP 2026-10-07: los centros de atención farmacéutica estándar no estratifican.
  if (arm === 'standard') return <Navigate to={`/visits/${visitId}/interventions`} replace />;

  const renderField = (field: CmoAnswerFieldDefinition) => {
    const name = `cmo-${field.code}`;
    const options = [...field.options.map((o) => ({ value: o.value, label: o.label, points: o.points })), { value: UNKNOWN, label: UNKNOWN_LABEL, points: 0 }];
    return (
      <fieldset key={field.code} className="questionnaire-item strat-variable" data-variable={field.code}>
        <legend>
          {field.label}
          {field.specialRule ? <span className="strat-flag"> · regla especial</span> : null}
        </legend>
        <div className="radio-row" role="radiogroup" aria-label={field.label}>
          {options.map((option) => (
            <label key={option.value} className="radio-inline">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={answers[field.code] === option.value}
                onChange={() => setAnswer(field.code, option.value)}
                disabled={!arm}
              />
              {option.label}
              {showResults && option.value !== UNKNOWN ? <span className="strat-points">{option.points} pt</span> : null}
            </label>
          ))}
        </div>
        {field.code === 'sexo_mujer' && sexPrefilled ? (
          <p className="help-text">Precargado desde la ficha del paciente ({getSexLabel(patient?.sex ?? null)}). Revíselo antes de guardar.</p>
        ) : null}
        <details className="strat-help">
          <summary>Criterio operativo</summary>
          <p><strong>Definición:</strong> {field.definition}</p>
          <p><strong>Criterio (fuente):</strong> {field.criteria}</p>
          {field.code === 'medicamento_reciente' ? <p className="text-warning"><strong>Discrepancia con el protocolo (D2):</strong> {RECENT_MEDICATION_PROTOCOL_DISCREPANCY}</p> : null}
        </details>
      </fieldset>
    );
  };

  const savedLevel = toCmoLevel(registry?.priority);
  const savedTriggered = items.filter((item) => item.is_scored && (item.item_score ?? 0) > 0);
  const savedInformative = items.filter((item) => !item.is_scored);

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Estratificación CMO-DERMAPEX</h1>
        <VisitTabs visitId={visitId} active="clinical" />

        {!arm && patient ? (
          <Notice tone="danger" title="Centro sin cohorte asignada">
            <p>El centro de este paciente no tiene asignada la cohorte del estudio (CMO o estándar). Coordinación debe asignarla antes de estratificar.</p>
          </Notice>
        ) : null}


        <p className="help-text">
          Modelo {CMO_MODEL_VERSION} · motor {CMO_ENGINE_VERSION}. Decisiones de implementación D1-D8: {DERMAPEX_DECISIONS.D1.status}.
        </p>

        {registry ? (
          <Notice tone="info">
            <p>
              Esta visita ya tiene una estratificación registrada ({formatDateTime(registry.updated_at)} · motivo: {getStratificationReasonLabel(registry.stratification_reason)}).
              Guardar de nuevo la sustituye; el valor anterior queda en la auditoría.
            </p>
          </Notice>
        ) : null}

        {errorMessage ? <ErrorState title="No se pudo completar la operación" message={errorMessage} /> : null}
      </section>

      <form className="page-stack" onSubmit={handleSubmit} aria-label="Formulario de estratificación CMO">
        <section className="card">
          <SectionHeader
            title="Motivo y variables"
            description="Responda cada variable: Sí, No o Desconocido. «Desconocido» puntúa 0 y marca el resultado como incompleto (D1)."
          />
          <label className="strat-reason">
            Motivo de la estratificación <span className="required-mark">*</span>
            <select required value={reason} onChange={(e) => setReason(e.target.value as StratificationReason | '')} disabled={!arm}>
              <option value="">Seleccionar motivo</option>
              {STRATIFICATION_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>

          {CMO_BLOCKS.map((block) => (
            <fieldset key={block.id} className="form-section strat-block">
              <legend>
                {block.id === 'especifica' ? 'Variable específica · dermatológica' : block.label}
                {showResults ? <span className="strat-block-max"> · máx. {block.declaredMaxPoints} pts (declarado por la fuente)</span> : null}
              </legend>
              {block.id === 'demografica' ? (
                <div className="questionnaire-item strat-variable" data-variable={AGE_GROUP_CODE}>
                  <p className="strat-derived-label">Grupo de edad <span className="help-text">(derivada de la ficha; no editable)</span></p>
                  <p>
                    {age !== null ? `${age} años` : 'Edad no registrada en la ficha'} → {ageGroup ? ageGroup.label : UNKNOWN_LABEL}
                    {showResults && ageGroup ? <span className="strat-points"> {ageGroup.points} pt</span> : null}
                  </p>
                  {!ageGroup ? <p className="text-warning">Sin edad en la ficha: la variable queda como desconocida (0 puntos).</p> : null}
                </div>
              ) : null}
              {CMO_ANSWER_FIELDS.filter((f) => f.block === block.id).map(renderField)}
            </fieldset>
          ))}

          <fieldset className="form-section strat-block">
            <legend>Variable informativa · no puntúa (D3)</legend>
            {CMO_INFORMATIVE_FIELDS.map((field) => (
              <fieldset key={field.code} className="questionnaire-item strat-variable" data-variable={field.code}>
                <legend>{field.label} <span className="strat-flag">· informativa, no puntúa</span></legend>
                <div className="radio-row" role="radiogroup" aria-label={field.label}>
                  {[...field.options, { value: UNKNOWN, label: UNKNOWN_LABEL }].map((option) => (
                    <label key={option.value} className="radio-inline">
                      <input
                        type="radio"
                        name={`cmo-${field.code}`}
                        value={option.value}
                        checked={informative[field.code] === option.value}
                        onChange={() => {
                          setSavedNotice(null);
                          setInformative((prev) => ({ ...prev, [field.code]: option.value }));
                        }}
                        disabled={!arm}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <p className="help-text">{field.definition}</p>
              </fieldset>
            ))}
          </fieldset>
        </section>

        {showResults ? (
          <section className="card" aria-labelledby="strat-preview-title">
            <SectionHeader id="strat-preview-title" title="Vista previa (sin guardar)" description="Se recalcula al responder. Las variables sin responder cuentan como desconocidas." />
            <CmoResultPanel score={preview.totalScore} level={preview.level} statusText="puntos · vista previa" specialRuleApplied={preview.specialRuleApplied} />
            {preview.specialRuleApplied ? (
              <Notice tone="warning" title="Regla especial: embarazo o deseo gestacional">
                <p>Nivel 1 asignado por la regla especial del modelo, con independencia de la puntuación.</p>
              </Notice>
            ) : null}
            {preview.incomplete ? (
              <Notice tone="warning" title={`Resultado incompleto: ${preview.unknown.length} variable(s) desconocida(s) o sin responder`}>
                <p>{preview.unknown.map(labelForCode).join(' · ')}</p>
                <p>Las variables desconocidas puntúan 0: el nivel puede infraestimar la complejidad.</p>
              </Notice>
            ) : null}
          </section>
        ) : null}

        <section className="card">
          <div className="form-actions">
            <button type="submit" disabled={!canSave}>{saving ? 'Guardando...' : 'Guardar estratificación'}</button>
            <span className="help-text" aria-live="polite">
              {answeredCount} de {totalToAnswer} variables respondidas{!reason ? ' · falta el motivo' : ''}
            </span>
          </div>
          {savedNotice ? (
            <Notice tone="success" className="strat-saved-notice">
              <p>{savedNotice}</p>
            </Notice>
          ) : null}
        </section>
      </form>

      {registry ? (
        <section className="card" aria-labelledby="strat-saved-title">
          <SectionHeader
            id="strat-saved-title"
            title="Estratificación registrada"
            description={`${formatDateTime(registry.updated_at)} · motivo: ${getStratificationReasonLabel(registry.stratification_reason)} · motor ${registry.engine_version ?? '-'}`}
          />

          {registry.incomplete ? (
            <Notice tone="warning" title={`Registro incompleto: ${registry.unknown_count} variable(s) desconocida(s)`}>
              <p>{registry.unknown_variables.map(labelForCode).join(' · ')}</p>
            </Notice>
          ) : null}

          {!showResults || !registry.results_visible ? (
            <Notice tone="success" title={COMPARATOR_SAVED_MESSAGE}>
              <p>Variables registradas: {items.length}. Valores guardados en la visita; los resultados del modelo no se muestran en este centro.</p>
            </Notice>
          ) : (
            <>
              <CmoResultPanel
                score={Number(registry.score ?? 0)}
                level={registry.priority}
                statusText="puntos · guardado"
                specialRuleApplied={Boolean(registry.special_rule_applied)}
              />
              {registry.special_rule_applied ? (
                <Notice tone="warning" title="Regla especial aplicada: embarazo o deseo gestacional">
                  <p>El nivel 1 se debe a la regla especial, no a la puntuación ({registry.score} puntos).</p>
                </Notice>
              ) : null}

              <div className="split-grid">
                <div className="table-wrap">
                  <table aria-label="Desglose por bloque">
                    <thead>
                      <tr><th>Bloque</th><th className="num">Puntos</th><th className="num">Máx. declarado</th></tr>
                    </thead>
                    <tbody>
                      {CMO_BLOCKS.map((block) => (
                        <tr key={block.id}>
                          <td>{block.label}</td>
                          <td className="num strong">{registry.block_scores?.find((b) => b.block === block.id)?.points ?? 0}</td>
                          <td className="num">{block.declaredMaxPoints}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="strong">Total</td>
                        <td className="num strong">{registry.score}</td>
                        <td className="num">{CMO_BLOCKS.reduce((s, b) => s + b.declaredMaxPoints, 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="table-wrap">
                  <table aria-label="Variables que puntúan">
                    <thead>
                      <tr><th>Variable</th><th>Valor</th><th className="num">Puntos</th></tr>
                    </thead>
                    <tbody>
                      {savedTriggered.length === 0 ? (
                        <tr><td colSpan={3} className="cell-muted">Ninguna variable puntúa.</td></tr>
                      ) : (
                        savedTriggered.map((item) => (
                          <tr key={item.id}>
                            <td>{item.label}</td>
                            <td>
                              {describeAnswer(item.variable_code, item.raw_value?.value ?? UNKNOWN)}
                              {item.variable_code === AGE_GROUP_CODE && item.raw_value?.age != null ? ` (${item.raw_value.age} años)` : ''}
                            </td>
                            <td className="num strong">{item.item_score}</td>
                          </tr>
                        ))
                      )}
                      {savedInformative.map((item) => (
                        <tr key={item.id}>
                          <td>{item.label} <span className="help-text">(informativa)</span></td>
                          <td>{describeAnswer(item.variable_code, item.raw_value?.value ?? UNKNOWN)}</td>
                          <td className="num cell-muted">no puntúa</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {savedLevel ? (
                <>
                  <ProtocolPackage level={savedLevel} />
                  <div className="actions-inline section-footer-actions">
                    <CmoLevelBadge level={savedLevel} score={registry.score} />
                    <span className="help-text">{CMO_LEVEL_META[savedLevel].criterion}</span>
                    {arm === 'cmo' ? <Link className="button-link" to={`/visits/${visitId}/interventions`}>Registrar intervenciones</Link> : null}
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <div className="actions-inline">
        {visit ? <Link to={`/patients/${visit.patient_id}`}>Volver a la ficha del paciente</Link> : null}
      </div>
    </div>
  );
}
