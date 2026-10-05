import { Link } from 'react-router-dom';

import { PROJECT_IDENTITY, PROJECT_INSTITUTIONAL_REFERENCE } from '../../constants/institutional';

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-container public-footer-inner">
        <div>
          <strong>{PROJECT_IDENTITY.name}</strong>
          <p>{PROJECT_IDENTITY.subtitle}.</p>
          {PROJECT_INSTITUTIONAL_REFERENCE.ethicsApprovalCode ? (
            <p className="public-footer-code">{PROJECT_INSTITUTIONAL_REFERENCE.ethicsApprovalCode}</p>
          ) : null}
        </div>
        <nav aria-label="Información legal y del servicio">
          <Link to="/legal">Aviso legal</Link>
          <Link to="/privacy">Política de privacidad</Link>
          <Link to="/security">Seguridad</Link>
          <Link to="/cookies">Cookies</Link>
          <Link to="/legal#contacto">Contacto</Link>
        </nav>
      </div>
    </footer>
  );
}
