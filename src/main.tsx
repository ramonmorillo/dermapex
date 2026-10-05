import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import './styles/main.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  document.body.innerHTML =
    '<main style="padding: 2rem; font-family: system-ui, sans-serif;"><h1>Error de inicialización</h1><p>No se encontró el contenedor <code>#root</code> en <code>index.html</code>.</p></main>';
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
