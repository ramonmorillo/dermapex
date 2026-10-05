import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { EmailOtpType } from '@supabase/supabase-js';

import { ErrorState } from '../components/common/ErrorState';
import { PublicFooter } from '../components/public/PublicFooter';
import { BrandMark } from '../components/ui/BrandMark';
import { PROJECT_IDENTITY } from '../constants/institutional';
import { verifyEmailLinkToken } from '../services/authService';

const SUPPORTED_TYPES: Record<string, { type: EmailOtpType; title: string; description: string; mode: 'invite' | 'recovery' }> = {
  invite: {
    type: 'invite',
    title: 'Aceptar invitación',
    description: 'Has sido invitado/a al estudio DERMAPEX. Pulsa «Continuar» para crear tu contraseña.',
    mode: 'invite',
  },
  recovery: {
    type: 'recovery',
    title: 'Recuperar contraseña',
    description: 'Pulsa «Continuar» para establecer una nueva contraseña.',
    mode: 'recovery',
  },
};

/**
 * Destino de los enlaces de los correos de Supabase (plantillas con token_hash).
 * El token NO se canjea al abrir la página, sino al pulsar «Continuar»: así los escáneres de
 * enlaces del correo corporativo no consumen el enlace de un solo uso antes que el destinatario.
 */
export function ConfirmEmailLinkPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tokenHash = searchParams.get('token_hash');
  const config = SUPPORTED_TYPES[searchParams.get('type') ?? ''];

  const handleContinue = async () => {
    if (!tokenHash || !config) return;
    setWorking(true);
    setErrorMessage(null);
    const result = await verifyEmailLinkToken(tokenHash, config.type);
    setWorking(false);

    if (result.error || !result.session) {
      setErrorMessage('El enlace no es válido, ya se ha utilizado o ha caducado. Solicita uno nuevo con «¿Has olvidado tu contraseña?» en la página de acceso.');
      return;
    }

    // Sustituye la URL para que el token no quede en el historial.
    navigate(`/set-password?mode=${config.mode}`, { replace: true });
  };

  return (
    <div className="public-page">
      <header className="public-header public-header-compact">
        <div className="public-container public-nav">
          <Link className="public-brand" to="/" aria-label={`${PROJECT_IDENTITY.name} · Volver al inicio`}>
            <BrandMark size={34} />
            <span><strong>{PROJECT_IDENTITY.name}</strong><small>CMO-MAPEX</small></span>
          </Link>
        </div>
      </header>

      <main className="access-section" id="contenido">
        <div className="public-container access-grid">
          <section className="auth-card" aria-labelledby="confirm-link-title">
            <header className="auth-card-header">
              <p className="iris-eyebrow">{PROJECT_IDENTITY.name} · Acceso profesional</p>
              <h1 id="confirm-link-title">{config?.title ?? 'Enlace no válido'}</h1>
              {config ? <p className="auth-supporting-copy">{config.description}</p> : null}
            </header>

            {tokenHash && config ? (
              <div className="form-grid">
                <button type="button" className="button-block" onClick={handleContinue} disabled={working}>
                  {working ? 'Validando...' : 'Continuar'}
                </button>
                {errorMessage ? <ErrorState title="No se pudo validar el enlace" message={errorMessage} /> : null}
              </div>
            ) : (
              <ErrorState title="Enlace incompleto" message="Abre esta página desde el enlace del correo de invitación o de recuperación de contraseña." />
            )}

            <p className="auth-note"><Link to="/login">Volver al acceso</Link></p>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
