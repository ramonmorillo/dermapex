import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import pkg from './package.json';

// Ruta base de publicación. Por defecto '/' (dominio propio o desarrollo local).
// Para GitHub Pages sin dominio propio (https://<usuario>.github.io/dermapex/) usar
// DERMAPEX_BASE_PATH=/dermapex/ en el entorno de build (ver workflow de despliegue).
const basePath = process.env.DERMAPEX_BASE_PATH?.trim() || '/';

export default defineConfig({
  plugins: [react()],
  base: basePath,
  // Versión de la app registrada en el manifiesto de cada exportación (+ commit si lo aporta el build).
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}${process.env.GITHUB_SHA ? `+${process.env.GITHUB_SHA.slice(0, 7)}` : ''}`),
  },
});
