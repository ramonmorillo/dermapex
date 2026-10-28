import { PageHeader } from '../components/ui/PageHeader';
import { PENDING_PROTOCOL_LABEL, PROJECT_IDENTITY, PROJECT_INSTITUTIONAL_REFERENCE } from '../constants/institutional';

export function ProjectPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="DERMAPEX · Proyecto"
        title="Marco del estudio"
        description="Datos institucionales del estudio. Los campos pendientes se completarán a partir del protocolo oficial aprobado."
      />

      <section className="card institutional-block" aria-labelledby="project-title">
        <h2 id="project-title">{PROJECT_IDENTITY.name}</h2>
        <p className="project-title">{PROJECT_IDENTITY.subtitle}</p>
        <dl className="definition-grid">
          <div className="definition-wide">
            <dt>Título de la investigación</dt>
            <dd>{PROJECT_INSTITUTIONAL_REFERENCE.projectTitle}</dd>
          </div>
          <div>
            <dt>Diseño</dt>
            <dd>Estudio prospectivo multicéntrico</dd>
          </div>
          <div>
            <dt>Promotor</dt>
            <dd>{PROJECT_INSTITUTIONAL_REFERENCE.sponsor ?? PENDING_PROTOCOL_LABEL}</dd>
          </div>
          <div>
            <dt>Investigador principal</dt>
            <dd>{PROJECT_INSTITUTIONAL_REFERENCE.principalInvestigator ?? PENDING_PROTOCOL_LABEL}</dd>
          </div>
          <div>
            <dt>Aprobación del comité de ética</dt>
            <dd>
              {PROJECT_INSTITUTIONAL_REFERENCE.ethicsApprovalCode ? (
                <>
                  {PROJECT_INSTITUTIONAL_REFERENCE.ethicsCommittee ? <>{PROJECT_INSTITUTIONAL_REFERENCE.ethicsCommittee}<br /></> : null}
                  <span className="numeric nowrap">Código {PROJECT_INSTITUTIONAL_REFERENCE.ethicsApprovalCode}</span>
                </>
              ) : (
                PENDING_PROTOCOL_LABEL
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
