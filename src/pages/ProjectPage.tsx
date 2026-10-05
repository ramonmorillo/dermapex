import { PageHeader } from '../components/ui/PageHeader';
import { THESIS_INSTITUTIONAL_REFERENCE } from '../constants/institutional';

export function ProjectPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="IRIS · Proyecto institucional"
        title="Marco académico y clínico"
        description="Este módulo documenta la base universitaria del proyecto y el marco de investigación que soporta el uso de IRIS en seguimiento farmacoterapéutico."
      />

      <section className="card institutional-block" aria-labelledby="project-title">
        <h2 id="project-title">Proyecto doctoral vinculado</h2>
        <p className="project-title">“{THESIS_INSTITUTIONAL_REFERENCE.projectTitle}”</p>
        <dl className="definition-grid">
          <div>
            <dt>Doctoranda</dt>
            <dd>{THESIS_INSTITUTIONAL_REFERENCE.doctoralCandidate}</dd>
          </div>
          <div>
            <dt>Dirección de tesis</dt>
            <dd>{THESIS_INSTITUTIONAL_REFERENCE.thesisDirectors}</dd>
          </div>
          <div>
            <dt>Universidad</dt>
            <dd>{THESIS_INSTITUTIONAL_REFERENCE.university}</dd>
          </div>
          <div>
            <dt>Código SICEIA</dt>
            <dd className="numeric">{THESIS_INSTITUTIONAL_REFERENCE.siceiaCode}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
