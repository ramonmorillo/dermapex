import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { PublicFooter } from '../components/public/PublicFooter';
import { BrandMark } from '../components/ui/BrandMark';
import { LoadingState } from '../components/ui/LoadingState';
import { PROJECT_IDENTITY } from '../constants/institutional';
import { consumePendingAuthLink } from '../lib/authLinks';
import { getCurrentSession, setSessionFromAuthLink, updatePassword } from '../services/authService';

const MIN_PASSWORD_LENGTH = 10;

type PageState = 'checking' | 'ready' | 'no-session';

/**
 * Fijar contraseña tras una invitación, o establecer una nueva tras «He olvidado mi contraseña».
 * Solo es accesible con la sesión temporal que crea el enlace del correo.
 */
export function SetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>('checking');
  const [isInvite, setIsInvite] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const link = consumePendingAuthLink();
      if (link?.kind === 'session') {
        setIsInvite(link.type === 'invite' || link.type === 'signup');
        const result = await setSessionFromAuthLink(link.accessToken, link.refreshToken);
        if (!mounted) return;
        if (result.error || !result.session) {
          setErrorMessage('El enlace no es válido o ha caducado. Solicita uno nuevo.');
          setState('no-session');
          return;
        }
        setEmail(result.user?.email ?? null);
        setState('ready');
        return;
      }

      const { session } = await getCurrentSession();
      if (!mounted) return;
      setEmail(session?.user.email ?? null);
      setState(session ? 'ready' : 'no-session');
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setErrorMessage('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);
    const { error } = await updatePassword(password);
    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    navigate('/dashboard', { replace: true });
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
          <section className="auth-card" aria-labelledby="set-password-title">
            <header className="auth-card-header">
              <p className="iris-eyebrow">{PROJECT_IDENTITY.name} · Acceso profesional</p>
              <h1 id="set-password-title">{isInvite ? 'Crea tu contraseña' : 'Nueva contraseña'}</h1>
              {email ? <p className="auth-supporting-copy">Cuenta: <strong>{email}</strong></p> : null}
            </header>

            {state === 'checking' ? <LoadingState label="Validando el enlace..." /> : null}

            {state === 'no-session' ? (
              <>
                <ErrorState
                  title="Enlace no válido"
                  message={errorMessage ?? 'Abre esta página desde el enlace del correo de invitación o de recuperación de contraseña.'}
                />
                <p className="auth-note"><Link to="/login">Volver al acceso</Link></p>
              </>
            ) : null}

            {state === 'ready' ? (
              <form onSubmit={handleSubmit} className="form-grid">
                <label>
                  Contraseña (mínimo {MIN_PASSWORD_LENGTH} caracteres)
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  Repite la contraseña
                  <input
                    type="password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                  />
                </label>
                <button type="submit" className="button-block" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar contraseña y entrar'}
                </button>
                {errorMessage ? <ErrorState title="No se pudo guardar la contraseña" message={errorMessage} /> : null}
              </form>
            ) : null}
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
