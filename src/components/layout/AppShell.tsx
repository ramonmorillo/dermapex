import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { getCurrentSession, signOut, subscribeToAuthChanges } from '../../services/authService';
import { InstitutionalReference } from '../common/InstitutionalReference';
import { IrisMark } from '../ui/IrisMark';
import { LoadingState } from '../ui/LoadingState';

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link active' : 'nav-link');

export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Ficha de paciente y pantallas de visita pertenecen a la sección "Pacientes"; el alta tiene entrada propia.
  const isPatientsSection = (pathname.startsWith('/patients') && pathname !== '/patients/new') || pathname.startsWith('/visits/');
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function validateSession() {
      const { session, error } = await getCurrentSession();
      if (!mounted) return;

      if (error) {
        setSessionError(error.message);
        setCheckingSession(false);
        return;
      }

      if (!session) {
        navigate('/login', { replace: true });
        return;
      }

      setSessionError(null);
      setCheckingSession(false);
    }

    const subscription = subscribeToAuthChanges((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' || !session) {
        navigate('/login', { replace: true });
        return;
      }
      if (event === 'SIGNED_IN') setSessionError(null);
    });

    void validateSession();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [navigate]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setSessionError(null);
    const { error } = await signOut();
    if (error) {
      setSessionError(error.message);
      setIsSigningOut(false);
      return;
    }
    navigate('/login', { replace: true });
  };

  if (checkingSession) {
    return (
      <div className="app-shell">
        <main className="main-content">
          <LoadingState label="Comprobando sesión..." />
        </main>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="app-shell">
        <main className="main-content">
          <section className="error-state" role="alert">
            <h2>Error de autenticación</h2>
            <p>{sessionError}</p>
            <Link to="/login" className="button-link">
              Ir al inicio de sesión
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/dashboard" aria-label="IRIS · Ir al dashboard">
            <IrisMark size={30} />
            <span className="brand-stack">
              <span className="brand-name">IRIS</span>
              <span className="brand-subtitle">Intelligent Risk &amp; Intervention Suite</span>
            </span>
          </Link>
          <nav className="main-nav" aria-label="Navegación principal">
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
            <Link
              to="/patients"
              className={isPatientsSection ? 'nav-link active' : 'nav-link'}
              aria-current={isPatientsSection ? 'page' : undefined}
            >
              Pacientes
            </Link>
            <NavLink to="/patients/new" className={navLinkClass}>
              Nuevo paciente
            </NavLink>
            <NavLink to="/project" className={navLinkClass}>
              Proyecto
            </NavLink>
          </nav>
          <div className="topbar-meta">
            <span className="system-status" title="Sesión autenticada en el entorno profesional de IRIS">
              <span className="system-status-dot" aria-hidden="true" />
              Entorno profesional seguro
            </span>
            <button type="button" className="nav-signout" onClick={handleSignOut} disabled={isSigningOut}>
              {isSigningOut ? 'Saliendo...' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      </header>
      <main className="main-content" id="main-content">
        <Outlet />
      </main>
      <footer className="app-footer">
        <InstitutionalReference compact />
      </footer>
    </div>
  );
}
