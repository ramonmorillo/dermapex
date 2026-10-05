import { CMO_LEVEL_META, toCmoLevel } from '../../constants/cmoLevels';

type CmoLevelBadgeProps = {
  level: unknown;
  score?: number | null;
  variant?: 'full' | 'short';
};

// Indicador de intensidad: tres barras, tantas activas como complejidad (N1 = 3, N3 = 1).
export function CmoLevelBadge({ level, score, variant = 'full' }: CmoLevelBadgeProps) {
  const value = toCmoLevel(level);
  if (!value) return <span className="text-muted">-</span>;

  const meta = CMO_LEVEL_META[value];
  const activeBars = 4 - value;

  return (
    <span className={`cmo-badge cmo-badge-${value}`} title={`${meta.label} · ${meta.complexity}`}>
      <span className="cmo-badge-bars" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span key={bar} className={bar <= activeBars ? 'is-on' : undefined} />
        ))}
      </span>
      <span>{variant === 'short' ? meta.shortLabel : meta.label}</span>
      {typeof score === 'number' ? <span className="cmo-badge-score">{score} pts</span> : null}
    </span>
  );
}
