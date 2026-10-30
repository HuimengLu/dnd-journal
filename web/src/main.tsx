import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App.tsx';
import { ToastProvider } from './components/Toasts.tsx';
import { CardLooks } from './components/CardLooks.tsx';
import { readKey } from './api.ts';

readKey(); // move ?key= from the address bar into storage before anything renders

// Images are decoration only; stop the browser's native image drag (the ghost copy) everywhere.
document.addEventListener('dragstart', (e) => {
  if (e.target instanceof HTMLImageElement) e.preventDefault();
});

/**
 * A crayon stroke: the edge wobbles (Figma TEXTURE), then a paper-tooth noise wears holes through the pigment
 * wherever the noise is above `threshold`, so the paper shows through as it does under a real crayon.
 * `tooth` is the grain's baseFrequency (two values make it directional), `sharpness` how hard the holes' edges are,
 * `soften` an optional blur that makes the pigment look waxy.
 */
function CrayonFilter({ id, wobble, wobbleFreq, tooth, octaves, threshold, sharpness, soften }: {
  id: string; wobble: number; wobbleFreq: string; tooth: string; octaves: number; threshold: number; sharpness: number; soften?: number;
}) {
  return (
    <filter id={id} x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency={wobbleFreq} numOctaves="3" seed="3" result="wobble" />
      <feDisplacementMap in="SourceGraphic" in2="wobble" scale={wobble} xChannelSelector="R" yChannelSelector="G" result="drawn" />
      <feTurbulence type="fractalNoise" baseFrequency={tooth} numOctaves={octaves} seed="11" stitchTiles="stitch" result="tooth" />
      <feColorMatrix in="tooth" type="matrix" values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${-sharpness} 0 0 0 ${sharpness * threshold}`} result="pigment" />
      <feComposite in="drawn" in2="pigment" operator="in" result="worn" />
      {soften ? <feGaussianBlur in="worn" stdDeviation={soften} /> : null}
    </filter>
  );
}

/**
 * A brush-pen line whose width swells and thins along its length. The line is bent (low-frequency displacement)
 * and roughened, then blurred; a slow "pen pressure" noise moves the cut-off level across the blur, so where the
 * pressure is high the edge is cut further out (thicker) and where it is low, further in (thinner). The cut is
 * filled with flat ink, so each filter has a fixed colour: `${id}` for ink lines, `${id}-grey` for the dashed empty
 * slots. `${id}-art` is the matching treatment for coloured artwork: the same bend, no re-inking.
 * (No feMorphology here: dilating card-sized layers froze the renderer.)
 */
function SketchFilter({ id, bend, bendFreq, rough, soft, cut, pressureFreq, pressure }: {
  id: string; bend: number; bendFreq: string; rough: number; soft: number; cut: number; pressureFreq: string; pressure: number;
}) {
  const line = (fid: string, ink: string) => (
    <filter id={fid} x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency={bendFreq} numOctaves="2" seed="5" result="bendNoise" />
      <feDisplacementMap in="SourceGraphic" in2="bendNoise" scale={bend} xChannelSelector="R" yChannelSelector="G" result="bent" />
      <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="2" result="roughNoise" />
      <feDisplacementMap in="bent" in2="roughNoise" scale={rough} xChannelSelector="R" yChannelSelector="G" result="drawn" />
      <feGaussianBlur in="drawn" stdDeviation={soft} result="falloff" />
      <feTurbulence type="fractalNoise" baseFrequency={pressureFreq} numOctaves="1" seed="9" result="pressureNoise" />
      <feColorMatrix in="pressureNoise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="pressureAlpha" />
      {/* pressed = falloff × (1 + pressure × (0.5 − noise)): scales the line, never adds ink where there is none */}
      <feComposite in="falloff" in2="pressureAlpha" operator="arithmetic" k1={-pressure} k2={1 + pressure / 2} k3="0" k4="0" result="pressed" />
      <feComponentTransfer in="pressed" result="edge">
        <feFuncA type="linear" slope="6" intercept={0.5 - 6 * cut} />
      </feComponentTransfer>
      <feFlood floodColor={ink} />
      <feComposite in2="edge" operator="in" />
    </filter>
  );
  return (
    <>
      {line(id, '#2f2f2f')}
      {line(`${id}-grey`, '#b2b2b2')}
      <filter id={`${id}-art`} x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency={bendFreq} numOctaves="2" seed="5" result="bendNoise" />
        <feDisplacementMap in="SourceGraphic" in2="bendNoise" scale={bend * 0.6} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {/* shared SVG filter: the Figma "GRAIN/TEXTURE" wobble for hand-drawn frames */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" seed="0" />
          <feDisplacementMap in="SourceGraphic" scale="1.8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* brush-pen strokes for the "sketch" card looks */}
        <SketchFilter id="sketch" bend={2.2} bendFreq="0.03" rough={0.8} soft={1.4} cut={0.3} pressureFreq="0.035" pressure={0.9} />
        <SketchFilter id="sketch-bold" bend={2.4} bendFreq="0.03" rough={0.8} soft={1.9} cut={0.24} pressureFreq="0.03" pressure={1.3} />
        <SketchFilter id="sketch-loose" bend={4} bendFreq="0.02" rough={1.3} soft={1.4} cut={0.3} pressureFreq="0.05" pressure={1} />
        {/* crayon strokes for the character card looks (CardLook in CharacterCard.tsx). Thresholds were measured:
            at sharpness 25 they keep roughly 92% / 86% / 76% / 84% / 88% of the pigment */}
        <CrayonFilter id="crayon-fine" wobble={2} wobbleFreq="0.55" tooth="1.1" octaves={2} threshold={0.7} sharpness={25} />
        <CrayonFilter id="crayon" wobble={2.6} wobbleFreq="0.5" tooth="0.85" octaves={3} threshold={0.65} sharpness={25} />
        <CrayonFilter id="crayon-heavy" wobble={3.4} wobbleFreq="0.35" tooth="0.55" octaves={3} threshold={0.6} sharpness={25} />
        <CrayonFilter id="crayon-streak" wobble={2.4} wobbleFreq="0.5" tooth="0.12 1.3" octaves={2} threshold={0.64} sharpness={25} />
        <CrayonFilter id="crayon-wax" wobble={2.4} wobbleFreq="0.45" tooth="0.7" octaves={3} threshold={0.66} sharpness={25} soften={0.45} />
        {/* Figma 58:2109 Slot Frame ("Ballpoint" effect style): TEXTURE 1.2 only */}
        <filter id="slot-ink" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" seed="0" />
          <feDisplacementMap in="SourceGraphic" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {new URLSearchParams(location.search).has('card-looks') ? <CardLooks /> : <App />}
    </ToastProvider>
  </StrictMode>,
);
