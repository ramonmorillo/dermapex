import type { ReactNode } from 'react';

type SectionHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
};

export function SectionHeader({ title, description, actions, id }: SectionHeaderProps) {
  return (
    <div className="section-heading">
      <div>
        <h2 id={id}>{title}</h2>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {actions ? <div className="section-heading-actions">{actions}</div> : null}
    </div>
  );
}
