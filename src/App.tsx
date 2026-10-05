import { RouterProvider } from 'react-router-dom';

import { supabaseEnvStatus } from './lib/supabase';
import { router } from './router';

function MissingSupabaseConfig() {
  // En la web publicada no se muestran detalles técnicos de despliegue al usuario final.
  if (!import.meta.env.DEV) {
    return (
      <div className="app-shell">
        <main className="main-content">
          <section className="card error-state">
            <h1>Aplicación no disponible</h1>
            <p>DERMAPEX no está configurada en este entorno. Contacta con la coordinación del estudio.</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="main-content">
        <section className="card error-state">
          <h1>Falta configuración de Supabase</h1>
          <p>Define estas variables en tu archivo .env local para continuar:</p>
          <ul>
            {supabaseEnvStatus.missingVars.map((envVar) => (
              <li key={envVar}>
                <code>{envVar}</code>
              </li>
            ))}
          </ul>
          <p>
            Puedes usar <code>.env.example</code> como guía. Luego reinicia <code>npm run dev</code>.
          </p>
        </section>
      </main>
    </div>
  );
}

function App() {
  if (!supabaseEnvStatus.isConfigured) {
    return <MissingSupabaseConfig />;
  }

  return <RouterProvider router={router} />;
}

export default App;
