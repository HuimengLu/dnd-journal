import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App.tsx';
import { ToastProvider } from './components/Toasts.tsx';
import { readKey } from './api.ts';

readKey(); // move ?key= from the address bar into storage before anything renders

// Images are decoration only; stop the browser's native image drag (the ghost copy) everywhere.
document.addEventListener('dragstart', (e) => {
  if (e.target instanceof HTMLImageElement) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {/* shared SVG filter: the Figma "GRAIN/TEXTURE" wobble for hand-drawn frames */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" seed="0" />
          <feDisplacementMap in="SourceGraphic" scale="1.8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <App />
    </ToastProvider>
  </StrictMode>,
);
