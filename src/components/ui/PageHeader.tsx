import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions, children }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        <div className="page-header-text">
          {eyebrow ? <p className="iris-eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {description ? <p className="page-header-description">{description}</p> : null}
        </div>
        {actions ? <div className="page-header-actions">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
