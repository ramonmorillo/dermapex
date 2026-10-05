import { PENDING_PROTOCOL_LABEL, PROJECT_INSTITUTIONAL_REFERENCE, PROJECT_SHORT_FOOTER } from '../../constants/institutional';

type InstitutionalReferenceProps = {
  compact?: boolean;
};

export function InstitutionalReference({ compact = false }: InstitutionalReferenceProps) {
  if (compact) {
    return <p className="institutional-footer">{PROJECT_SHORT_FOOTER}</p>;
  }

  return (
    <section className="card institutional-block" aria-label="Referencia institucional">
      <h2>Referencia institucional · DERMAPEX</h2>
      <p>
        Proyecto:
        <br />
        <strong>{PROJECT_INSTITUTIONAL_REFERENCE.projectTitle}</strong>
      </p>
      <p>
        <strong>Promotor:</strong> {PROJECT_INSTITUTIONAL_REFERENCE.sponsor ?? PENDING_PROTOCOL_LABEL}
        <br />
        <strong>Investigador principal:</strong> {PROJECT_INSTITUTIONAL_REFERENCE.principalInvestigator ?? PENDING_PROTOCOL_LABEL}
        <br />
        <strong>Código de aprobación CEIm:</strong> {PROJECT_INSTITUTIONAL_REFERENCE.ethicsApprovalCode ?? PENDING_PROTOCOL_LABEL}
      </p>
    </section>
  );
}
