import type { ReactNode } from 'react';

import { CmoLevelBadge } from './CmoLevelBadge';
import { StatusBadge, type StatusTone } from './StatusBadge';

type PatientHeaderProps = {
  eyebrow?: string;
  studyCode: string;
  sexLabel?: string;
  age?: number | null;
  level?: number | null;
  score?: number | null;
  lastVisitDate?: string | null;
  followup?: { tone: StatusTone; label: string } | null;
  details?: Array<{ label: string; value: ReactNode }>;
  actions?: ReactNode;
  compact?: boolean;
};

// Cabecera de identificación del paciente: el usuario debe saber siempre a quién está revisando.
export function PatientHeader({
  eyebrow = 'Paciente',
  studyCode,
  sexLabel,
  age,
  level,
  score,
  lastVisitDate,
  followup,
  details = [],
  actions,
  compact = false,
}: PatientHeaderProps) {
  const demographics = [sexLabel && sexLabel !== '-' ? sexLabel : null, typeof age === 'number' ? `${age} años` : null].filter(Boolean);

  return (
    <header className={compact ? 'patient-header patient-header-compact' : 'patient-header'} aria-label={`Paciente ${studyCode}`}>
      <div className="patient-header-identity">
        <p className="iris-eyebrow">{eyebrow}</p>
        <div className="patient-header-title">
          {compact ? <strong className="patient-code">{studyCode}</strong> : <h1 className="patient-code">{studyCode}</h1>}
          {demographics.length > 0 ? <span className="patient-demographics">{demographics.join(' · ')}</span> : null}
        </div>
      </div>

      <dl className="patient-header-facts">
        <div>
          <dt>Nivel CMO actual</dt>
          <dd>{level ? <CmoLevelBadge level={level} score={score} /> : <span className="text-muted">Sin estratificar</span>}</dd>
        </div>
        {lastVisitDate !== undefined ? (
          <div>
            <dt>Última visita</dt>
            <dd className="numeric">{lastVisitDate ?? '—'}</dd>
          </div>
        ) : null}
        {followup ? (
          <div>
            <dt>Seguimiento</dt>
            <dd>
              <StatusBadge tone={followup.tone} dot>
                {followup.label}
              </StatusBadge>
            </dd>
          </div>
        ) : null}
        {details.map((detail) => (
          <div key={detail.label}>
            <dt>{detail.label}</dt>
            <dd>{detail.value}</dd>
          </div>
        ))}
      </dl>

      {actions ? <div className="patient-header-actions">{actions}</div> : null}
    </header>
  );
}
