import { createRoot } from 'react-dom/client';
import App from '../client/src/App';

export function initApp() {
  const container = document.getElementById('app');
  if (!container) throw new Error('No #app element found');
  createRoot(container).render(<App />);
}
