import type { ReactNode } from 'react';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

type NoticeProps = {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
};

// Aviso contextual (ClinicalAlert). El rojo se reserva a errores/alertas reales.
export function Notice({ tone = 'info', title, children, className }: NoticeProps) {
  return (
    <div
      className={['notice', `notice-${tone}`, className].filter(Boolean).join(' ')}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {title ? <p className="notice-title">{title}</p> : null}
      {children ? <div className="notice-body">{children}</div> : null}
    </div>
  );
}
