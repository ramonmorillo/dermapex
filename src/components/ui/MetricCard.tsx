import type { ReactNode } from 'react';

export type MetricTone = 'default' | 'warning' | 'positive' | 'danger';

type MetricCardProps = {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: MetricTone;
  size?: 'md' | 'lg';
};

export function MetricCard({ label, value, unit, hint, tone = 'default', size = 'md' }: MetricCardProps) {
  return (
    <div className={`metric metric-${size} metric-tone-${tone}`}>
      <dt className="metric-label">{label}</dt>
      <dd className="metric-value">
        {value}
        {unit ? <span className="metric-unit">{unit}</span> : null}
      </dd>
      {hint ? <dd className="metric-hint">{hint}</dd> : null}
    </div>
  );
}

export function MetricGrid({ children, columns }: { children: ReactNode; columns?: 3 | 4 | 5 }) {
  return <dl className={columns ? `metric-grid metric-grid-${columns}` : 'metric-grid'}>{children}</dl>;
}
