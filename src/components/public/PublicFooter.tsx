import { Link } from 'react-router-dom';

import { PROJECT_IDENTITY, getEthicsApprovalText } from '../../constants/institutional';

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-container public-footer-inner">
        <div>
          <strong>{PROJECT_IDENTITY.name}</strong>
          <p>{PROJECT_IDENTITY.subtitle}.</p>
          {getEthicsApprovalText() ? (
            <p className="public-footer-code">Aprobado por el {getEthicsApprovalText()}</p>
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
