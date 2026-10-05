import { THESIS_INSTITUTIONAL_REFERENCE, THESIS_SHORT_FOOTER } from '../../constants/institutional';

type InstitutionalReferenceProps = {
  compact?: boolean;
};

export function InstitutionalReference({ compact = false }: InstitutionalReferenceProps) {
  if (compact) {
    return <p className="institutional-footer">{THESIS_SHORT_FOOTER}</p>;
  }

  return (
    <section className="card institutional-block" aria-label="Referencia institucional">
      <h2>Referencia institucional · IRIS</h2>
      <p>
        Proyecto universitario vinculado:
        <br />
        <strong>“{THESIS_INSTITUTIONAL_REFERENCE.projectTitle}”</strong>
      </p>
      <p>
        <strong>Doctoranda:</strong> {THESIS_INSTITUTIONAL_REFERENCE.doctoralCandidate}
        <br />
        <strong>Directores de tesis:</strong> {THESIS_INSTITUTIONAL_REFERENCE.thesisDirectors}
        <br />
        <strong>Universidad:</strong> {THESIS_INSTITUTIONAL_REFERENCE.university}
        <br />
        <strong>Código de aprobación SICEIA:</strong> {THESIS_INSTITUTIONAL_REFERENCE.siceiaCode}
      </p>
    </section>
  );
}
