import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './scss/style.css';
import App from './App.jsx';

const rootEl = document.getElementById('root');

if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} else {
  console.error("Root element not found");
}
