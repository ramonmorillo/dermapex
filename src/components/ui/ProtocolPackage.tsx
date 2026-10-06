import { CMO_LEVEL_META } from '../../constants/cmoLevels';
import { PROTOCOL_LEVEL_PACKAGES, PROTOCOL_PACKAGE_SOURCE } from '../../constants/dermapexStudyConfig';
import type { CmoLevel } from '../../services/cmoScoringEngine';

// Paquete mínimo de actuaciones del protocolo para el nivel (D4). Sustituye a la periodicidad de
// seguimiento de la fuente (P1 semestral / P2 anual), que no se muestra.
export function ProtocolPackage({ level }: { level: CmoLevel }) {
  const pkg = PROTOCOL_LEVEL_PACKAGES[level];
  return (
    <section className="protocol-package" aria-label={pkg.title}>
      <p className="form-block-title">{pkg.title} · {CMO_LEVEL_META[level].complexity}</p>
      <ul className="simple-list">
        {pkg.actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
      <p className="help-text">Fuente: {PROTOCOL_PACKAGE_SOURCE}. Criterio del nivel: {pkg.criterion}.</p>
    </section>
  );
}
