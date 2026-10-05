import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { PublicFooter } from '../components/public/PublicFooter';
import { BrandMark } from '../components/ui/BrandMark';
import { LoadingState } from '../components/ui/LoadingState';
import { PROJECT_IDENTITY } from '../constants/institutional';
import { getCurrentSession, signInWithPassword, subscribeToAuthChanges } from '../services/authService';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function ensureAnonymousState() {
      const { session, error } = await getCurrentSession();

      if (!mounted) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setCheckingSession(false);
        return;
      }

      if (session) {
        navigate('/dashboard', { replace: true });
        return;
      }

      setCheckingSession(false);
    }

    const subscription = subscribeToAuthChanges((event, session) => {
      if (!mounted) {
        return;
      }

      if (event === 'SIGNED_IN' && session) {
        navigate('/dashboard', { replace: true });
      }
    });

    void ensureAnonymousState();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    const { error } = await signInWithPassword(email, password);
    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="public-page">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <header className="public-header">
        <div className="public-container public-nav">
          <a className="public-brand" href="#inicio" aria-label="DERMAPEX · Inicio">
            <BrandMark size={36} />
            <span><strong>{PROJECT_IDENTITY.name}</strong><small>CMO-MAPEX</small></span>
          </a>
          <nav aria-label="Navegación pública">
            <a className="public-access-link" href="#acceso">Acceso profesional</a>
          </nav>
        </div>
      </header>

      {/*
        Fase de migración arquitectónica: los textos públicos heredados de IRIS (propuesta de valor,
        funcionalidades, datos de la tesis RCV) se han retirado. El contenido público definitivo de
        DERMAPEX se redactará a partir del protocolo aprobado. No añadir claims clínicos aquí.
      */}
      <main id="contenido">
        <section className="public-hero" id="inicio" aria-labelledby="hero-title">
          <div className="public-container">
            <div className="hero-copy">
              <p className="iris-eyebrow">Estudio prospectivo multicéntrico</p>
              <h1 id="hero-title">{PROJECT_IDENTITY.name}</h1>
              <p className="hero-lead">{PROJECT_IDENTITY.subtitle}.</p>
              <p className="hero-support">Acceso restringido a profesionales autorizados participantes en el estudio.</p>
              <div className="hero-actions">
                <a className="button-link" href="#acceso">Acceso profesional</a>
              </div>
            </div>
          </div>
        </section>

        <section className="access-section" id="acceso" aria-labelledby="auth-title">
          <div className="public-container access-grid">
            <div className="access-context"><p className="iris-eyebrow">Entorno profesional seguro</p><h2>Acceso restringido al estudio</h2><p>Accede al entorno de trabajo con las credenciales facilitadas para tu participación.</p><div className="responsible-note"><strong>Uso responsable</strong><p>{PROJECT_IDENTITY.name} apoya el registro estructurado y el seguimiento en el marco del estudio. Sus resultados deben ser interpretados por profesionales sanitarios cualificados y no sustituyen el juicio clínico individual.</p></div></div>
            <section className="auth-card" aria-labelledby="auth-title">
              <header className="auth-card-header"><p className="iris-eyebrow">{PROJECT_IDENTITY.name} · Área restringida</p><h2 id="auth-title">Acceso profesional</h2><p className="auth-supporting-copy">Acceso exclusivo para profesionales autorizados participantes en el estudio.</p></header>
              {checkingSession ? <LoadingState label="Comprobando sesión activa..." /> : <form onSubmit={handleSubmit} className="form-grid"><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="profesional@centro.es" /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><button type="submit" className="button-block" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button></form>}
              {errorMessage ? <ErrorState title="No se pudo iniciar sesión" message={errorMessage} /> : null}
              <p className="auth-note"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" /></svg>Entorno profesional seguro</p>
            </section>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
