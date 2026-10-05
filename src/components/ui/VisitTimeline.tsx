import { Link } from 'react-router-dom';

import { getVisitStatusLabel, getVisitTypeLabel, type VisitStatus } from '../../constants/enums';
import { CmoLevelBadge } from './CmoLevelBadge';

export type TimelineVisit = {
  id: string;
  visitType: string | null;
  date: string | null;
  status: VisitStatus | null;
  level: number | null;
  score: number | null;
  href: string;
};

// Vista longitudinal compacta: una columna por visita, ordenadas cronológicamente.
export function VisitTimeline({ visits }: { visits: TimelineVisit[] }) {
  if (visits.length === 0) return null;

  return (
    <ol className="visit-timeline" aria-label="Línea temporal de visitas">
      {visits.map((visit) => {
        const nodeClass =
          visit.status === 'completed' ? 'timeline-node is-done' : visit.status === 'cancelled' ? 'timeline-node is-cancelled' : 'timeline-node';
        return (
          <li key={visit.id}>
            <span className={nodeClass} aria-hidden="true" />
            <Link className="timeline-title" to={visit.href}>
              {getVisitTypeLabel(visit.visitType)}
            </Link>
            <span className="timeline-date">
              {visit.date ?? 'Sin fecha'} · {getVisitStatusLabel(visit.status)}
            </span>
            <span className="timeline-meta">
              {visit.level ? <CmoLevelBadge level={visit.level} score={visit.score} variant="short" /> : <span className="help-text">Sin score</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
