import { Link } from 'react-router-dom';

import { THESIS_INSTITUTIONAL_REFERENCE } from '../../constants/institutional';

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-container public-footer-inner">
        <div>
          <strong>IRIS · CMO-RCV</strong>
          <p>Herramienta digital vinculada al proyecto de investigación.</p>
          <p className="public-footer-code">{THESIS_INSTITUTIONAL_REFERENCE.siceiaCode}</p>
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
