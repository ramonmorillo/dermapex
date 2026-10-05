export type DistributionSegment = {
  key: string;
  label: string;
  value: number;
  className: string;
};

type DistributionBarProps = {
  segments: DistributionSegment[];
  total: number;
  ariaLabel: string;
};

// Barra apilada con leyenda numérica: el dato manda, la barra solo orienta.
export function DistributionBar({ segments, total, ariaLabel }: DistributionBarProps) {
  const safeTotal = total > 0 ? total : 0;
  const pct = (value: number) => (safeTotal === 0 ? 0 : (value / safeTotal) * 100);

  return (
    <div className="distribution">
      <div className="distribution-bar" role="img" aria-label={ariaLabel}>
        {segments.map((segment) =>
          segment.value > 0 ? (
            <span key={segment.key} className={`distribution-segment ${segment.className}`} style={{ flexBasis: `${pct(segment.value)}%` }} />
          ) : null,
        )}
      </div>
      <ul className="distribution-legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span className={`distribution-swatch ${segment.className}`} aria-hidden="true" />
            <span className="distribution-legend-label">{segment.label}</span>
            <span className="distribution-legend-value">
              {segment.value}
              <span className="distribution-legend-pct">{pct(segment.value).toFixed(1)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
