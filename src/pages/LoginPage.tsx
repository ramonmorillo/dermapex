import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { PublicFooter } from '../components/public/PublicFooter';
import { IrisMark } from '../components/ui/IrisMark';
import { LoadingState } from '../components/ui/LoadingState';
import { THESIS_INSTITUTIONAL_REFERENCE } from '../constants/institutional';
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
          <a className="public-brand" href="#inicio" aria-label="IRIS · Inicio">
            <IrisMark size={36} />
            <span><strong>IRIS</strong><small>CMO-RCV</small></span>
          </a>
          <nav aria-label="Navegación pública">
            <a href="#iris">Conocer IRIS</a>
            <a href="#investigacion">Investigación</a>
            <a className="public-access-link" href="#acceso">Acceso profesional</a>
          </nav>
        </div>
      </header>

      <main id="contenido">
        <section className="public-hero" id="inicio" aria-labelledby="hero-title">
          <div className="public-container hero-grid">
            <div className="hero-copy">
              <p className="iris-eyebrow">IRIS · Proyecto CMO-RCV</p>
              <h1 id="hero-title">Estratificación.<br />Seguimiento. Intervención.</h1>
              <p className="hero-lead">Una plataforma digital para estructurar el seguimiento farmacoterapéutico de personas con riesgo cardiovascular mediante el modelo CMO.</p>
              <p className="hero-support">IRIS integra en un único entorno la estratificación de complejidad, el seguimiento longitudinal, los resultados reportados por el paciente, la medicación y las intervenciones farmacéuticas.</p>
              <div className="hero-actions">
                <a className="button-link" href="#acceso">Acceso profesional</a>
                <a className="button-secondary" href="#iris">Conocer IRIS</a>
              </div>
              <p className="hero-reference">Proyecto de investigación desarrollado en el marco de la Universidad de Sevilla · {THESIS_INSTITUTIONAL_REFERENCE.siceiaCode}</p>
            </div>
            <div className="longitudinal-card" aria-label="Seguimiento longitudinal desde la visita basal hasta los doce meses">
              <div className="longitudinal-heading"><span>Evolución longitudinal</span><strong>12 meses</strong></div>
              <svg viewBox="0 0 520 210" role="img" aria-labelledby="timeline-title timeline-desc">
                <title id="timeline-title">Línea temporal de seguimiento</title>
                <desc id="timeline-desc">Cuatro puntos de seguimiento: basal, tres, seis y doce meses.</desc>
                <path className="timeline-grid" d="M35 160H485 M35 110H485 M35 60H485" />
                <path className="timeline-area" d="M45 132 C115 128,130 98,190 105 S275 78,330 86 S410 54,475 62 L475 160 L45 160Z" />
                <path className="timeline-line" d="M45 132 C115 128,130 98,190 105 S275 78,330 86 S410 54,475 62" />
                {[[45,132,'Basal'],[190,105,'3 meses'],[330,86,'6 meses'],[475,62,'12 meses']].map(([x,y,label], index) => (
                  <g key={label as string} className={`timeline-point timeline-point-${index + 1}`}>
                    <circle cx={x} cy={y} r="7" /><text x={x} y="190" textAnchor="middle">{label}</text>
                  </g>
                ))}
              </svg>
              <div className="longitudinal-meta"><span>Seguimiento estructurado</span><span>Resultados en el tiempo</span></div>
            </div>
          </div>
        </section>

        <section className="public-section" id="iris" aria-labelledby="value-title">
          <div className="public-container">
            <div className="section-heading"><p className="iris-eyebrow">Un marco común de trabajo</p><h2 id="value-title">Atención farmacéutica estructurada</h2><p>Tres ejes conectados para organizar el seguimiento dentro del proyecto.</p></div>
            <div className="value-grid">
              {[
                ['01', 'Estratificar', 'Identificar de forma estructurada la complejidad del paciente mediante el modelo CMO.'],
                ['02', 'Seguir', 'Visualizar longitudinalmente variables clínicas, farmacoterapéuticas y resultados reportados por el paciente.'],
                ['03', 'Intervenir', 'Documentar y orientar una atención farmacéutica adaptada a las necesidades detectadas.'],
              ].map(([number, title, copy]) => <article className="value-card" key={title}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
            </div>
          </div>
        </section>

        <section className="public-section public-section-muted" aria-labelledby="features-title">
          <div className="public-container">
            <div className="section-heading"><p className="iris-eyebrow">Funcionalidades</p><h2 id="features-title">Un entorno integrado para el seguimiento</h2></div>
            <div className="feature-grid">
              {[
                ['Estratificación CMO', 'Priorización estructurada según complejidad y necesidades del paciente.'],
                ['Seguimiento longitudinal', 'Evolución temporal de variables clínicas y farmacoterapéuticas.'],
                ['Cuestionarios de seguimiento', 'Integración de IEXPAC, Morisky-Green y EQ-5D-5L.'],
                ['Medicación', 'Registro longitudinal y normalización de tratamientos.'],
                ['Intervenciones farmacéuticas', 'Registro estructurado de actuaciones realizadas durante el seguimiento.'],
                ['Informes', 'Generación de información estructurada para profesionales y pacientes.'],
              ].map(([title, copy], index) => <article className="feature-card" key={title}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}
            </div>
          </div>
        </section>

        <section className="public-section" aria-labelledby="process-title">
          <div className="public-container">
            <div className="section-heading"><p className="iris-eyebrow">Cómo funciona IRIS</p><h2 id="process-title">Del análisis a la medición de resultados</h2></div>
            <ol className="process-list">{['Evaluar', 'Estratificar', 'Intervenir', 'Seguir', 'Medir resultados'].map((step, index) => <li key={step}><span>{index + 1}</span><strong>{step}</strong></li>)}</ol>
          </div>
        </section>

        <section className="public-section product-section" aria-labelledby="product-title">
          <div className="public-container product-grid">
            <div className="section-heading"><p className="iris-eyebrow">Visualización del producto</p><h2 id="product-title">Información relevante, con una jerarquía clara</h2><p>Una interfaz diseñada para consultar actividad, evolución y resultados sin perder el contexto longitudinal.</p><ul className="product-points"><li>Vista consolidada del seguimiento</li><li>Registro estructurado por visitas</li><li>Indicadores clínicos y farmacoterapéuticos</li></ul></div>
            <div className="product-mockup" aria-label="Representación con datos neutros de la interfaz de IRIS">
              <div className="mockup-bar"><i /><i /><i /><span>IRIS · Seguimiento</span></div>
              <div className="mockup-body"><aside><strong>IRIS</strong><span>Resumen</span><span>Seguimiento</span><span>Resultados</span></aside><div className="mockup-content"><p>Resumen de seguimiento</p><div className="mockup-metrics"><span><small>Visitas</small><strong>04</strong></span><span><small>Periodo</small><strong>12 m</strong></span><span><small>Estado</small><strong>Activo</strong></span></div><div className="mockup-chart"><i /><i /><i /><i /><i /><i /></div><div className="mockup-rows"><span /><span /><span /></div></div></div>
            </div>
          </div>
        </section>

        <section className="public-section cmo-section" aria-labelledby="cmo-title">
          <div className="public-container cmo-grid"><div><p className="iris-eyebrow">Metodología CMO</p><h2 id="cmo-title">Seguimiento adaptado a las necesidades detectadas</h2><p>IRIS estructura el seguimiento farmacoterapéutico aplicando la metodología CMO, integrando capacidad, motivación y oportunidad para adaptar la intensidad de seguimiento a las necesidades del paciente.</p></div><div className="cmo-pillars" aria-label="Dimensiones de la metodología CMO"><span><strong>C</strong>Capacidad</span><span><strong>M</strong>Motivación</span><span><strong>O</strong>Oportunidad</span></div></div>
        </section>

        <section className="public-section" id="investigacion" aria-labelledby="research-title">
          <div className="public-container research-grid">
            <div><p className="iris-eyebrow">Proyecto de investigación</p><h2 id="research-title">Del modelo asistencial a la práctica real.</h2><p className="research-title">{THESIS_INSTITUTIONAL_REFERENCE.projectTitle}</p></div>
            <dl className="research-data"><div><dt>Doctoranda</dt><dd>{THESIS_INSTITUTIONAL_REFERENCE.doctoralCandidate}</dd></div><div><dt>Dirección</dt><dd>{THESIS_INSTITUTIONAL_REFERENCE.thesisDirectors}</dd></div><div><dt>Universidad</dt><dd>{THESIS_INSTITUTIONAL_REFERENCE.university}</dd></div><div><dt>Código</dt><dd>{THESIS_INSTITUTIONAL_REFERENCE.siceiaCode}</dd></div></dl>
          </div>
        </section>

        <aside className="research-notice"><div className="public-container"><strong>Herramienta vinculada al proyecto de investigación</strong><p>IRIS es una herramienta digital desarrollada para el proyecto de investigación CMO-RCV. El acceso está restringido a profesionales autorizados participantes en el proyecto.</p></div></aside>

        <section className="access-section" id="acceso" aria-labelledby="auth-title">
          <div className="public-container access-grid">
            <div className="access-context"><p className="iris-eyebrow">Entorno profesional seguro</p><h2>Acceso restringido al proyecto</h2><p>Accede al entorno de trabajo con las credenciales facilitadas para tu participación.</p><div className="responsible-note"><strong>Uso responsable</strong><p>IRIS apoya el registro estructurado y el seguimiento en el marco del proyecto de investigación CMO-RCV. Sus resultados deben ser interpretados por profesionales sanitarios cualificados y no sustituyen el juicio clínico individual.</p></div></div>
            <section className="auth-card" aria-labelledby="auth-title">
              <header className="auth-card-header"><p className="iris-eyebrow">IRIS · Área restringida</p><h2 id="auth-title">Acceso profesional</h2><p className="auth-supporting-copy">Acceso exclusivo para profesionales autorizados participantes en el proyecto.</p></header>
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
