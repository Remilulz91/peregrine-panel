import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Point d'entree de l'interface : monte l'application React dans la page.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Element racine introuvable (#root).');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
