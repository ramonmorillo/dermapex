import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Ruta base de publicación. Por defecto '/' (dominio propio o desarrollo local).
// Para GitHub Pages sin dominio propio (https://<usuario>.github.io/dermapex/) usar
// DERMAPEX_BASE_PATH=/dermapex/ en el entorno de build (ver workflow de despliegue).
const basePath = process.env.DERMAPEX_BASE_PATH?.trim() || '/';

export default defineConfig({
  plugins: [react()],
  base: basePath,
});
