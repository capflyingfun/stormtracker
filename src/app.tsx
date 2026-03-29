import { createRoot } from 'react-dom/client';
import { Router as WouterRouter } from 'wouter';
import App from '../client/src/App';

export function initApp() {
  const container = document.getElementById('app');
  if (!container) throw new Error('No #app element found');

  const base = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';

  createRoot(container).render(
    <WouterRouter base={base}>
      <App />
    </WouterRouter>
  );
}
