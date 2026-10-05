import { Link, useLocation } from 'react-router-dom';

import { PublicFooter } from '../components/public/PublicFooter';
import { IrisMark } from '../components/ui/IrisMark';

type PageContent = {
  eyebrow: string;
  title: string;
  introduction: string;
  sections: Array<{ title: string; body: string }>;
};

const pending = 'Información pendiente de validación jurídica.';

const pages: Record<string, PageContent> = {
  '/legal': {
    eyebrow: 'Información institucional',
    title: 'Aviso legal',
    introduction: 'Información provisional sobre el uso de este sitio web y de la herramienta IRIS.',
    sections: [
      { title: 'Titular y contacto', body: pending },
      { title: 'Finalidad del sitio', body: 'Presentar IRIS y facilitar el acceso restringido a profesionales autorizados participantes en el proyecto de investigación CMO-RCV.' },
      { title: 'Condiciones de uso', body: 'El acceso a las áreas profesionales requiere autorización. Las personas usuarias deben custodiar sus credenciales y utilizar la herramienta exclusivamente en el marco autorizado.' },
      { title: 'Propiedad intelectual', body: pending },
      { title: 'Responsabilidad', body: 'IRIS apoya el registro estructurado y el seguimiento del proyecto. La información que presenta debe ser interpretada por profesionales sanitarios cualificados y no sustituye el juicio clínico individual.' },
      { title: 'Legislación aplicable', body: pending },
    ],
  },
  '/privacy': {
    eyebrow: 'Protección de datos',
    title: 'Política de privacidad',
    introduction: 'Estructura informativa provisional. Los extremos jurídicos no confirmados se indican expresamente.',
    sections: [
      { title: 'Responsable y Delegado de Protección de Datos', body: pending },
      { title: 'Datos tratados', body: 'La aplicación está preparada para registrar datos identificativos, clínicos, farmacoterapéuticos y resultados de cuestionarios necesarios para el seguimiento del proyecto. La delimitación jurídica definitiva de las categorías tratadas está pendiente de validación.' },
      { title: 'Finalidad y base jurídica', body: pending },
      { title: 'Datos relativos a la salud e investigación', body: 'IRIS se utiliza en el marco del proyecto de investigación CMO-RCV. Las condiciones concretas del tratamiento de datos de salud y su relación con la investigación están pendientes de validación jurídica.' },
      { title: 'Destinatarios, encargados y alojamiento', body: pending },
      { title: 'Conservación', body: pending },
      { title: 'Derechos', body: pending },
      { title: 'Transferencias internacionales', body: pending },
    ],
  },
  '/security': {
    eyebrow: 'Entorno profesional',
    title: 'Seguridad',
    introduction: 'Información técnica verificable sobre las medidas visibles en la implementación actual de IRIS.',
    sections: [
      { title: 'Acceso restringido', body: 'Las áreas operativas requieren una sesión autenticada. Si no existe una sesión válida, la aplicación dirige al acceso profesional.' },
      { title: 'Autenticación y datos', body: 'La implementación utiliza Supabase para la autenticación y el acceso a datos. La base de datos incorpora políticas de seguridad a nivel de fila (RLS) definidas en las migraciones del proyecto.' },
      { title: 'Comunicaciones', body: 'El sitio público de producción debe servirse mediante HTTPS. La seguridad efectiva también depende de la configuración del alojamiento, Supabase y los dispositivos de las personas usuarias.' },
      { title: 'Uso responsable', body: 'Las credenciales son personales y deben mantenerse bajo custodia. Ningún sistema puede presentarse como exento de riesgo.' },
    ],
  },
  '/cookies': {
    eyebrow: 'Privacidad técnica',
    title: 'Cookies y almacenamiento local',
    introduction: 'La revisión del código de esta aplicación no ha identificado herramientas de analítica, publicidad ni seguimiento de terceros.',
    sections: [
      { title: 'Sesión y funcionamiento', body: 'Supabase puede utilizar el almacenamiento local del navegador para mantener la sesión autenticada y permitir el funcionamiento técnico del acceso profesional.' },
      { title: 'Cookies no necesarias', body: 'La aplicación no incorpora en su código Google Analytics, Meta Pixel ni otros rastreadores publicitarios. No se ha añadido un banner de consentimiento al no haberse detectado mecanismos no necesarios en esta interfaz.' },
      { title: 'Preferencias técnicas', body: 'Existe una preferencia local opcional de depuración del módulo de medicación. No se utiliza con fines publicitarios ni de elaboración de perfiles.' },
      { title: 'Información jurídica', body: 'La clasificación y redacción jurídica definitiva de estos mecanismos está pendiente de validación.' },
    ],
  },
};

export function PublicInfoPage() {
  const { pathname } = useLocation();
  const page = pages[pathname] ?? pages['/legal'];

  return (
    <div className="public-page">
      <a className="skip-link" href="#public-content">Saltar al contenido</a>
      <header className="public-header public-header-compact">
        <div className="public-container public-nav">
          <Link className="public-brand" to="/" aria-label="IRIS · Volver al inicio">
            <IrisMark size={34} />
            <span><strong>IRIS</strong><small>CMO-RCV</small></span>
          </Link>
          <Link className="public-access-link" to="/login">Acceso profesional</Link>
        </div>
      </header>
      <main id="public-content" className="legal-main public-container">
        <p className="iris-eyebrow">{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <p className="legal-intro">{page.introduction}</p>
        <div className="legal-sections">
          {page.sections.map((section) => (
            <section key={section.title} id={section.title === 'Titular y contacto' ? 'contacto' : undefined}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
        <Link to="/" className="text-link">← Volver a IRIS</Link>
      </main>
      <PublicFooter />
    </div>
  );
}
