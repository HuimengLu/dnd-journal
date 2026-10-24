import { createContext, useContext, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { STICKER_DRAG_TYPE } from '../stickers.ts';
import tapePeach from '../assets/figma/washi-tape-peach.svg';

/**
 * Logical stage = the Figma "BG 01 · Scrapbook Spread — Paper Grain" frame (20:925) cropped to the notebook
 * (Figma x − 104, y − 22), plus a 72px gutter on the left for the paper picker.
 * The whole stage scales to fit the window; content uses these coordinates.
 */
const GUTTER = 72;
export const STAGE_W = 1272 + GUTTER;
export const STAGE_H = 890;
/** The two-page spread (both pages) inside the notebook. Journal objects are stored relative to this. */
export const SPREAD = { x: 16, y: 54, w: 1200, h: 816 };
export const PAGE_W = 600;

/** Paper for a spread (both pages). Small-grid is the default. */
export type Paper = 'large' | 'lined' | 'small';
export const DEFAULT_PAPER: Paper = 'small';
export const PAPERS: { id: Paper; label: string }[] = [
  { id: 'large', label: '大格子纸' },
  { id: 'lined', label: '横线纸' },
  { id: 'small', label: '小方格纸' },
];

const ScaleCtx = createContext(1);
export const useStageScale = () => useContext(ScaleCtx);

export function Stage({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = host.current!;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      setScale(Math.max(0.2, Math.min((width - 16) / STAGE_W, (height - 4) / STAGE_H, 1.4)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={host} className="stage-host">
      <div className="stage-box" style={{ width: STAGE_W * scale, height: STAGE_H * scale }}>
        <div className="stage" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}>
          <ScaleCtx.Provider value={scale}>{children}</ScaleCtx.Provider>
        </div>
      </div>
    </div>
  );
}

interface NotebookProps {
  tabs: ReactNode;
  paper: Paper;
  onPaperChange: (p: Paper) => void;
  /** Tool panel docked in the left margin, bottom-aligned with the notebook. */
  tools?: ReactNode;
  /** Sticker dropped from the drawer, at a point in spread coordinates. */
  onDropSticker?: (id: string, at: { x: number; y: number }) => void;
  /** Content laid over the whole spread (1200×816, origin at the left page's top-left). */
  children: ReactNode;
}

export function Notebook({ tabs, paper, onPaperChange, tools, onDropSticker, children }: NotebookProps) {
  const scale = useStageScale();
  const [dropping, setDropping] = useState(false);
  const isSticker = (e: DragEvent) => !!onDropSticker && e.dataTransfer.types.includes(STICKER_DRAG_TYPE);
  const onDragOver = (e: DragEvent) => { if (!isSticker(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropping(true); };
  const onDragLeave = (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false); };
  const onDrop = (e: DragEvent) => {
    setDropping(false);
    if (!isSticker(e)) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    onDropSticker!(e.dataTransfer.getData(STICKER_DRAG_TYPE), { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale });
  };
  return (
    <>
      <div className="paper-picker" role="radiogroup" aria-label="这一页的纸张">
        {PAPERS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={paper === p.id}
            aria-label={p.label}
            title={p.label}
            className={`paper-btn paper-btn--${p.id}${paper === p.id ? ' paper-btn--on' : ''}`}
            onClick={() => onPaperChange(p.id)}
          />
        ))}
      </div>

      {tools && <div className="tool-dock">{tools}</div>}

      <div className="nb" style={{ left: GUTTER }}>
        <div className="nb-cover grain" />
        <div className="nb-page nb-page--left grain"><PaperSheet kind={paper} /></div>
        <div className="nb-page nb-page--right grain"><PaperSheet kind={paper} /></div>

        <div className="nb-spine nb-spine--l" />
        <div className="nb-spine nb-spine--r" />
        <div className="nb-gutter" />

        <img className="nb-tape" src={tapePeach} alt="" style={{ left: 367, top: 817.4, width: 177.7, height: 40, transform: 'rotate(-3deg)' }} />

        <div
          className={`nb-content${dropping ? ' nb-content--drop' : ''}`}
          style={{ left: SPREAD.x, top: SPREAD.y, width: SPREAD.w, height: SPREAD.h }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {children}
        </div>
        <nav className="nb-tabs" aria-label="手帐页面">{tabs}</nav>
      </div>
    </>
  );
}

function PaperSheet({ kind }: { kind: Paper }) {
  if (kind === 'small') return <div className="nb-graph" />;
  if (kind === 'lined') return <div className="nb-lined" />;
  return (
    <>
      <p className="nb-print" style={{ left: 56 }}>SESSION Nº ____</p>
      <p className="nb-print" style={{ left: 236 }}>CAMPAIGN JOURNAL</p>
      <p className="nb-print" style={{ left: 438 }}>DATE ___ / ___</p>
      <div className="nb-rule" style={{ left: 56, top: 76, width: 488, background: 'rgba(58,53,44,0.55)' }} />
      <div className="nb-rule nb-rule--v" style={{ left: 300, top: 104, height: 636 }} />
      <div className="nb-rule" style={{ left: 56, top: 384, width: 488 }} />
      <div className="nb-rule" style={{ left: 56, top: 640, width: 488 }} />
      <p className="nb-print nb-print--label" style={{ left: 56, top: 400 }}>NOTES</p>
      <div className="nb-rule" style={{ left: 56, top: 416, width: 40, background: '#6e6555' }} />
      <p className="nb-print nb-print--footer" style={{ left: 56, top: 772 }}>VOL. 01 — PG. ___</p>
    </>
  );
}
