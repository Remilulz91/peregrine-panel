import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Interface entry point: mounts the React application into the page.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found (#root).');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
