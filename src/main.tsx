import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

try {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root element not found!');
  }

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (error) {
  console.error('Failed to render React app:', error);
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : '';
  document.body.innerHTML = `
    <div style="padding: 40px; font-family: monospace; background: #1a1a1a; color: #ff0000; min-height: 100vh;">
      <h1>React Initialization Error</h1>
      <p>${msg}</p>
      <pre>${stack}</pre>
    </div>
  `;
}
