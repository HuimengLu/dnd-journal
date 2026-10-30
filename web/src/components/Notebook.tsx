import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { STICKER_DRAG_TYPE } from '../stickers.ts';
import paperDot from '../assets/figma/paper-dot.svg';
import paperLargeGrid from '../assets/figma/paper-large-grid.svg';
import paperSmallGrid from '../assets/figma/paper-small-grid.svg';
import paperLinedLeft from '../assets/figma/paper-lined-left.svg';
import paperLinedRight from '../assets/figma/paper-lined-right.svg';

/**
 * Logical stage = the Figma "Scrapbook Spread" frame (54:1816, one variant per paper) shifted to the notebook
 * (Figma x − 68, y + 8), plus a 72px gutter on the left for the paper picker.
 * The whole stage scales to fit the window; content uses these coordinates.
 */
const GUTTER = 72;
const NB_W = 1350;
/** The page tabs now sit inside the cover, so the 40px band above the cover that held them is cropped off. */
const NB_TOP = -40;
export const STAGE_W = NB_W + GUTTER;
export const STAGE_H = 968 + NB_TOP;
/** The two-page spread (both pages) inside the notebook. Journal objects are stored relative to this. */
export const SPREAD = { x: 52, y: 84, w: 1200, h: 816 };
export const PAGE_W = 600;

/** Paper for a spread (both pages), in the order of the Figma variants. Small-grid is the default. */
export type Paper = 'graph' | 'dot' | 'large' | 'small' | 'lined';
export const DEFAULT_PAPER: Paper = 'small';
export const PAPERS: { id: Paper; label: string }[] = [
  { id: 'graph', label: '坐标纸' },
  { id: 'dot', label: '点点纸' },
  { id: 'large', label: '大格子纸' },
  { id: 'small', label: '小方格纸' },
  { id: 'lined', label: '横线纸' },
];

/** Exported Figma page art (Page / Paper 54:844), left and right page. Graph is drawn in CSS. */
const PAPER_ART: Record<Exclude<Paper, 'graph'>, [string, string]> = {
  dot: [paperDot, paperDot],
  large: [paperLargeGrid, paperLargeGrid],
  small: [paperSmallGrid, paperSmallGrid],
  lined: [paperLinedLeft, paperLinedRight],
};

/** Page Stack: seven sheets per side, deepest (Sheet 7) first, each 1.9px further out. [fill, border alpha] */
const SHEETS: [string, number][] = [
  ['#d8cbb0', 0.7], ['#dcd0b7', 0.66], ['#dfd4bd', 0.63], ['#e3d9c4', 0.59], ['#e7decb', 0.56], ['#ebe3d2', 0.52], ['#eee7d8', 0.49],
];
const STACK_SIDE_W = 613.3;

/**
 * Page turn: one leaf per page between the two tabs, hinged on the spine. The first leaf carries the old page, the
 * last lands as the new one, the ones in between are blank sheets riffling past. Long jumps show at most MAX_LEAVES.
 */
const MAX_LEAVES = 6;
const leafTiming = (n: number) => {
  const ms = n === 1 ? 900 : 750;
  const stagger = n === 1 ? 0 : Math.min(170, 520 / (n - 1));
  return { ms, stagger, total: ms + stagger * (n - 1) };
};

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
  /** Identity and tab position of the open page; a change plays the page turn (forward when the position grows). */
  pageKey: string;
  pageOrder: number;
}

interface SpreadSnapshot { key: string; order: number; paper: Paper; children: ReactNode }

export function Notebook({ tabs, paper, onPaperChange, tools, onDropSticker, children, pageKey, pageOrder }: NotebookProps) {
  const scale = useStageScale();
  // The last committed spread, and the turn in flight: the old spread stays drawn over the new one while it leaves.
  const shown = useRef<SpreadSnapshot>({ key: pageKey, order: pageOrder, paper, children });
  const [turning, setTurning] = useState<{ id: number; from: SpreadSnapshot; forward: boolean; leaves: number } | null>(null);
  useLayoutEffect(() => {
    const from = shown.current;
    if (from.key === pageKey) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setTurning(null); return; }
    const id = Date.now();
    const leaves = Math.min(MAX_LEAVES, Math.max(1, Math.abs(pageOrder - from.order)));
    setTurning({ id, from, forward: pageOrder >= from.order, leaves });
    const timer = setTimeout(() => setTurning((t) => (t?.id === id ? null : t)), leafTiming(leaves).total + 60);
    return () => clearTimeout(timer);
  }, [pageKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { shown.current = { key: pageKey, order: pageOrder, paper, children }; });
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

      <div className="nb" style={{ left: GUTTER, top: NB_TOP, width: NB_W }}>
        <LeatherCover />
        <div className="nb-stack" aria-hidden>
          {(['left', 'right'] as const).map((side) => (
            <div key={side} className="nb-stack-side" style={{ left: side === 'left' ? 0 : STACK_SIDE_W }}>
              {SHEETS.map(([fill, alpha], i) => (
                <div
                  key={i}
                  className={`nb-sheet nb-sheet--${side}`}
                  style={{
                    left: side === 'left' ? i * 1.9 : 0,
                    width: STACK_SIDE_W - i * 1.9,
                    background: fill,
                    borderColor: `rgba(168, 148, 110, ${alpha})`,
                    boxShadow: i === 0 ? `${side === 'left' ? -1.5 : 1.5}px 0 3px rgba(42, 26, 12, 0.35)` : undefined,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="nb-page nb-page--left grain"><PaperSheet kind={paper} side={0} /></div>
        <div className="nb-page nb-page--right grain"><PaperSheet kind={paper} side={1} /></div>

        <div className="nb-spine nb-spine--l" />
        <div className="nb-spine nb-spine--r" />
        <div className="nb-gutter" />

        <div
          className={`nb-content${dropping ? ' nb-content--drop' : ''}`}
          style={{ left: SPREAD.x, top: SPREAD.y, width: SPREAD.w, height: SPREAD.h }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {children}
        </div>
        {turning && (
          <PageTurnLayer key={turning.id} leaves={turning.leaves} forward={turning.forward} from={turning.from} to={{ key: pageKey, order: pageOrder, paper, children }} />
        )}
        <nav className="nb-tabs" aria-label="手帐页面">{tabs}</nav>
      </div>
    </>
  );
}

/** A non-interactive copy of a whole spread (both papers, spine shading, content), in spread coordinates. */
function SpreadCopy({ spread, x = 0 }: { spread: SpreadSnapshot; x?: number }) {
  return (
    <div className="turn-spread" style={{ left: x }}>
      <div className="nb-page nb-page--left grain" style={{ left: 0, top: 0 }}><PaperSheet kind={spread.paper} side={0} /></div>
      <div className="nb-page nb-page--right grain" style={{ left: PAGE_W, top: 0 }}><PaperSheet kind={spread.paper} side={1} /></div>
      <div className="nb-spine nb-spine--l" style={{ left: PAGE_W - 34, top: 0 }} />
      <div className="nb-spine nb-spine--r" style={{ left: PAGE_W, top: 0 }} />
      <div className="turn-content">{spread.children}</div>
    </div>
  );
}

/** A turning leaf: its front shows one half of `front`, its back the opposite half of `back`. */
function Leaf({ forward, front, back, style }: { forward: boolean; front: ReactNode; back: ReactNode; style?: CSSProperties }) {
  return (
    <div className={`turn-leaf turn-leaf--${forward ? 'fwd' : 'back'}`} style={style}>
      <div className="turn-face turn-face--front">{front}<span className="turn-shade" /></div>
      <div className="turn-face turn-face--back">{back}<span className="turn-shade" /></div>
    </div>
  );
}

/** The old spread leaving over the new one: `leaves` leaves flip in turn, each one landing on top of the last. */
function PageTurnLayer({ leaves, forward, from, to }: { leaves: number; forward: boolean; from: SpreadSnapshot; to: SpreadSnapshot }) {
  const { ms, stagger } = leafTiming(leaves);
  // the half of a spread a leaf face shows: the right page sits at x = -600 inside a 600px face
  const half = (s: SpreadSnapshot, side: 'left' | 'right') => <SpreadCopy spread={s} x={side === 'left' ? 0 : -PAGE_W} />;
  const blank = (side: 'left' | 'right') => (
    <div className={`nb-page nb-page--${side} grain turn-blank`} style={{ left: 0, top: 0 }}><PaperSheet kind={to.paper} side={side === 'left' ? 0 : 1} /></div>
  );
  const leaving = forward ? 'right' : 'left';
  const landing = forward ? 'left' : 'right';
  return (
    <div className="turn" style={{ left: SPREAD.x, top: SPREAD.y, width: SPREAD.w, height: SPREAD.h }} aria-hidden>
      {/* the page that stays put until the first leaf lands on it */}
      <div className="turn-still" style={{ clipPath: forward ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)' }}><SpreadCopy spread={from} /></div>
      {Array.from({ length: leaves }, (_, i) => (
        <Leaf key={i} forward={forward}
          // each leaf sits a hair below the one before it; turning over flips that, so later leaves land on top
          style={{ animationDuration: `${ms}ms`, animationDelay: `${i * stagger}ms`, '--lz': `${-(i + 1)}px` } as CSSProperties}
          front={i === 0 ? half(from, leaving) : blank(leaving)}
          back={i === leaves - 1 ? half(to, landing) : blank(landing)} />
      ))}
    </div>
  );
}

function PaperSheet({ kind, side }: { kind: Paper; side: 0 | 1 }) {
  if (kind === 'graph') return <div className="nb-graph" />;
  return <img className="nb-paper-art" src={PAPER_ART[kind][side]} alt="" width={PAGE_W} height={SPREAD.h} />;
}

/** Figma "Leather Cover" (54:1819): base, sheen, spine crease, stitching, page bed shadow and strap. */
function LeatherCover() {
  return (
    <div className="nb-cover" aria-hidden>
      <div className="nb-leather" />
      <div className="nb-leather-sheen nb-leather-sheen--light" />
      <div className="nb-leather-sheen nb-leather-sheen--shade" />
      <div className="nb-leather-crease" />
      <svg className="nb-stitch" width="1288" height="888" viewBox="0 0 1288 888">
        <rect className="nb-stitch-holes" x="15" y="16" width="1258" height="858" rx="15" />
        <rect className="nb-stitch-thread" x="15" y="15" width="1258" height="858" rx="15" />
      </svg>
      <div className="nb-bed" />
      <div className="nb-strap">
        <div className="nb-strap-body" />
        <svg className="nb-strap-stitch" width="74" height="68" viewBox="0 0 74 68">
          <path d="M9 7H51A16 16 0 0 1 67 23V45A16 16 0 0 1 51 61H9A2 2 0 0 1 7 59V9A2 2 0 0 1 9 7Z" />
        </svg>
      </div>
    </div>
  );
}
