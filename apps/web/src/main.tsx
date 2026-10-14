import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { theme } from './lib/embed';
import './styles.css';

// set before the first render so the page never flashes the other theme
if (theme === 'paper') document.documentElement.dataset.theme = 'paper';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
