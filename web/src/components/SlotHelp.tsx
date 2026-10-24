import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SlotInfo } from '../../../shared/types.ts';
import tape from '../assets/figma/washi-tape-peach.svg';

/** One-line hint above an attack/potion slot while the pointer rests on it. */
export function SlotTooltip({ info, anchor }: { info: SlotInfo; anchor: HTMLElement }) {
  const r = anchor.getBoundingClientRect();
  return createPortal(
    <div className="slot-tip" role="tooltip" style={{ left: r.left + r.width / 2, top: r.top - 10 }}>
      <b>{info.title}</b> {info.summary}
    </div>,
    document.body,
  );
}

let lastTilt = 0;

/** Rotation (deg) of the card the slot sits on, read from its wrapper's inline transform. */
export function sourceTilt(anchor: HTMLElement): number {
  const host = anchor.closest<HTMLElement>('.card-slot, .jo');
  const m = host?.style.transform.match(/rotate\((-?[\d.]+)deg\)/);
  return m ? Number(m[1]) : 0;
}

/** A fresh tilt each time, never close to the source card's tilt or to the previous note's. */
export function pickTilt(avoid: number): number {
  for (let i = 0; i < 50; i++) {
    const t = Math.round((Math.random() * 7 - 3.5) * 10) / 10;
    if (Math.abs(t - avoid) >= 1.5 && Math.abs(t - lastTilt) >= 0.8 && Math.abs(t) >= 0.6) return (lastTilt = t);
  }
  return (lastTilt = avoid > 0 ? -2 : 2);
}

/** Paper-strip note with the longer description, opened by clicking a slot. */
export function SlotNote({ info, anchor, tilt, onClose }: { info: SlotInfo; anchor: HTMLElement; tilt: number; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: 0 });

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const w = 300, h = box.current?.offsetHeight ?? 220;
    // prefer the right of the slot, then the left; keep inside the window
    let left = r.right + 14;
    if (left + w > window.innerWidth - 12) left = r.left - w - 14;
    left = Math.max(12, Math.min(window.innerWidth - w - 12, left));
    const top = Math.max(12, Math.min(window.innerHeight - h - 12, r.top + r.height / 2 - h / 2));
    setPos({ left, top });
    closeBtn.current?.focus();
  }, [anchor, info, tilt]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [anchor, onClose]);

  return createPortal(
    <div key={`${info.title}-${tilt}`} ref={box} className="slot-note" style={{ ...pos, ['--tilt' as string]: `${tilt}deg` }} role="dialog" aria-label={info.title}>
      <img className="slot-note-tape" src={tape} alt="" />
      <button ref={closeBtn} type="button" className="slot-note-close" onClick={onClose} aria-label="关闭说明">✕</button>
      <p className="slot-note-title">
        {info.title}
        {info.badge && info.badge !== '—' && <span className="slot-note-badge">{info.badge}</span>}
      </p>
      <p className="slot-note-summary">{info.summary}</p>
      <p className="slot-note-body">{info.details}</p>
    </div>,
    document.body,
  );
}
