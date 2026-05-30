import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerGdaThemes } from './lib/echarts-theme';
import { initTheme } from './lib/theme';
import './app.css';

initTheme();
registerGdaThemes();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
