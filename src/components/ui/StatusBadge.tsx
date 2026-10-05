import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'info' | 'positive' | 'warning' | 'danger';

type StatusBadgeProps = {
  tone?: StatusTone;
  children: ReactNode;
  dot?: boolean;
};

export function StatusBadge({ tone = 'neutral', children, dot = false }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-${tone}`}>
      {dot ? <span className="status-badge-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
