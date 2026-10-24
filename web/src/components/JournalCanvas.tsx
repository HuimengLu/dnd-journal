import { useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Character, JournalObject, Role, SlotInfo } from '../../../shared/types.ts';
import { api, assetUrl } from '../api.ts';
import { CARD_W, CharacterCard } from './CharacterCard.tsx';
import { SPREAD, useStageScale } from './Notebook.tsx';
import { useToast } from './Toasts.tsx';
import tape from '../assets/figma/washi-tape-top.svg';
import { stickerById } from '../stickers.ts';

interface Props {
  pageId: string;
  objects: JournalObject[];
  characters: Character[];
  role: Role;
  onOpen: (id: string) => void;
  onEditHp: (id: string, anchor: HTMLElement) => void;
  onQuickEdit: (id: string, field: 'gold' | 'potions', anchor: HTMLElement) => void;
  onSlotHover: (info: SlotInfo | null, anchor?: HTMLElement) => void;
  onSlotOpen: (info: SlotInfo, anchor: HTMLElement) => void;
  onDropImage?: (file: File, at: { x: number; y: number }) => void;
  /** Layered over the character overview: only the objects take pointer events, no empty-page note. */
  overlay?: boolean;
}

type Box = Pick<JournalObject, 'x' | 'y' | 'w' | 'h' | 'rotation'>;
/** Corner handle: scale and rotate around the object's centre (screen-space centre and start vector). */
type Transform = { cx: number; cy: number; vx: number; vy: number };
type Gesture = { id: string; mode: 'move' | 'transform'; startX: number; startY: number; start: Box; moved: boolean; t?: Transform; last?: Box };

/** A freeform page: uploaded images and character cards the DM can drag, resize, layer and remove. */
export function JournalCanvas({ pageId, objects, characters, role, onOpen, onEditHp, onQuickEdit, onSlotHover, onSlotOpen, onDropImage, overlay }: Props) {
  const isDm = role === 'dm';
  const scale = useStageScale();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Box>>({}); // in-progress positions, cleared when the server confirms
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const surface = useRef<HTMLDivElement>(null);

  const items = objects.filter((o) => o.pageId === pageId).sort((a, b) => a.z - b.z);
  useEffect(() => { setSelected(null); setConfirmRemove(false); }, [pageId]);
  // clicking anywhere that is not an object or its toolbar clears the selection
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.('.jo, .jo-toolbar')) { setSelected(null); setConfirmRemove(false); }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  useEffect(() => {
    // drop drafts the server has caught up with
    setDraft((d) => {
      const next = { ...d };
      for (const o of objects) if (next[o.id] && next[o.id].x === o.x && next[o.id].y === o.y && next[o.id].w === o.w && next[o.id].rotation === o.rotation) delete next[o.id];
      return next;
    });
  }, [objects]);

  const fail = (e: unknown) => toast({ tone: 'error', message: e instanceof Error ? e.message : '保存失败' });

  const begin = (e: ReactPointerEvent, o: JournalObject, mode: Gesture['mode']) => {
    if (!isDm || e.button !== 0) return;
    e.stopPropagation();
    setSelected(o.id);
    setConfirmRemove(false);
    const start = draft[o.id] ?? { x: o.x, y: o.y, w: o.w, h: o.h, rotation: o.rotation };
    let t: Transform | undefined;
    if (mode === 'transform') {
      const r = (e.currentTarget as HTMLElement).closest('.jo')!.getBoundingClientRect(); // a rotated box's bounding box shares its centre
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      t = { cx, cy, vx: e.clientX - cx, vy: e.clientY - cy };
    }
    gesture.current = { id: o.id, mode, startX: e.clientX, startY: e.clientY, start, moved: false, t };
  };
  const move = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = (e.clientX - g.startX) / scale, dy = (e.clientY - g.startY) / scale;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    if (!g.moved) { try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer already released */ } if (g.mode === 'move') setDragging(g.id); }
    g.moved = true;
    const s = g.start;
    let box: Box;
    if (g.mode === 'move') {
      box = { ...s, x: clamp(s.x + dx, -s.w + 60, SPREAD.w - 60), y: clamp(s.y + dy, -s.h + 60, SPREAD.h - 60) };
    } else {
      // distance from the centre sets the size, the angle sets the rotation; the centre stays put
      const t = g.t!, vx = e.clientX - t.cx, vy = e.clientY - t.cy;
      const ratio = Math.hypot(vx, vy) / Math.max(1, Math.hypot(t.vx, t.vy));
      const w = clamp(s.w * ratio, 40, 1400), h = (w * s.h) / s.w;
      let rot = s.rotation + ((Math.atan2(vy, vx) - Math.atan2(t.vy, t.vx)) * 180) / Math.PI;
      rot = ((rot + 540) % 360) - 180;
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      else if (Math.abs(rot) < 2) rot = 0; // gentle snap back to straight
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      box = { x: cx - w / 2, y: cy - h / 2, w, h, rotation: rot };
    }
    g.last = round(box);
    setDraft((d) => ({ ...d, [g.id]: g.last! }));
  };
  const end = async (o: JournalObject) => {
    const g = gesture.current;
    gesture.current = null;
    setDragging(null);
    if (!g) return;
    if (!g.moved) return; // a plain click selects; character details open on double-click
    const box = g.last; // the gesture's own copy: state may lag a render behind the last pointer move
    if (!box) return;
    try {
      await api.updateObject(o.id, box);
    } catch (err) {
      setDraft((d) => { const n = { ...d }; delete n[o.id]; return n; });
      fail(err);
    }
  };

  const layer = async (id: string, l: 'front' | 'back') => { try { await api.updateObject(id, { layer: l }); } catch (e) { fail(e); } };
  const remove = async (id: string) => {
    setSelected(null);
    setConfirmRemove(false);
    try { await api.deleteObject(id); } catch (e) { fail(e); }
  };

  const onDragOver = (e: DragEvent) => { if (isDm && onDropImage && e.dataTransfer.types.includes('Files')) e.preventDefault(); };
  const onDrop = (e: DragEvent) => {
    if (!isDm || !onDropImage) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const r = surface.current!.getBoundingClientRect();
    onDropImage(file, { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale });
  };

  const sel = items.find((o) => o.id === selected);
  const selBox = sel ? draft[sel.id] ?? sel : null;

  return (
    <div ref={surface} className={`jc${isDm ? ' jc--dm' : ''}${overlay ? ' jc--overlay' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      {items.length === 0 && !overlay && (
        <div className="empty-note" style={{ left: 330, top: 250 }}>
          <p className="empty-note-title">这一页还是空的</p>
          <p>{isDm ? '点上方的“上传图片”放地图或场景图，也可以直接把图片拖进来，或者把角色卡放到这一页。' : 'DM 还没有在这一页放东西。'}</p>
        </div>
      )}

      {items.map((o) => {
        const b = draft[o.id] ?? o;
        const ch = o.type === 'character' ? characters.find((c) => c.id === o.ref) : null;
        if (o.type === 'character' && !ch) return null;
        return (
          <div
            key={o.id}
            className={`jo jo--${o.type}${selected === o.id ? ' jo--selected' : ''}${dragging === o.id ? ' jo--dragging' : ''}`}
            style={{ left: b.x, top: b.y, width: b.w, height: b.h, zIndex: o.z + 1000, transform: `rotate(${b.rotation}deg)` }}
            onPointerDown={(e) => begin(e, o, 'move')}
            onPointerMove={move}
            onPointerUp={() => end(o)}
            onPointerCancel={() => { gesture.current = null; setDragging(null); }}
            onDoubleClick={isDm && o.type === 'character' ? (e) => { if (!(e.target as HTMLElement).closest('.cc-quick, .cc-hp-value--edit, .cc-bar')) onOpen(o.ref); } : undefined}
          >
            {o.type === 'sticker' ? (
              <img className="jo-sticker-img" src={stickerById(o.ref)?.url} alt={stickerById(o.ref)?.name ?? '贴纸'} draggable={false} />
            ) : o.type === 'image' ? (
              <figure className="jo-photo">
                <img src={assetUrl(o.ref)} alt="" draggable={false} />
                <img className="jo-tape" src={tape} alt="" draggable={false} />
              </figure>
            ) : (
              <div className="jo-card" style={{ transform: `scale(${b.w / CARD_W})` }} onPointerDown={(e) => { if ((e.target as HTMLElement).closest('.cc-hp-value--edit, .cc-bar, .cc-quick')) e.stopPropagation(); }}>
                <CharacterCard character={ch!} onOpen={isDm ? undefined : () => onOpen(ch!.id)} onEditHp={(a) => onEditHp(ch!.id, a)} canEditHp
                  onQuickEdit={isDm ? (f, a) => onQuickEdit(ch!.id, f, a) : undefined} onSlotHover={onSlotHover} onSlotOpen={onSlotOpen} />
              </div>
            )}
            {isDm && selected === o.id && (
              <span className="jo-resize" onPointerDown={(e) => begin(e, o, 'transform')} onPointerMove={move} onPointerUp={() => end(o)} title="拖动缩放、旋转（按住 Shift 每 15° 一档）" aria-label="拖动缩放和旋转">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.5 6.2A5 5 0 1 0 13 10" /><path d="M13.2 2.8l-.4 3.6-3.5-.5" /></svg>
              </span>
            )}
          </div>
        );
      })}

      {isDm && sel && selBox && (
        <div className="jo-toolbar" style={{ left: selBox.x, top: Math.max(-44, selBox.y - 52) }} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => layer(sel.id, 'front')}>移到最上层</button>
          <button type="button" onClick={() => layer(sel.id, 'back')}>移到最下层</button>
          {sel.type === 'character' && <button type="button" onClick={() => onOpen(sel.ref)}>查看详情</button>}
          {confirmRemove ? (
            <button type="button" className="danger" onClick={() => remove(sel.id)}>确认移除</button>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)}>从本页移除</button>
          )}
        </div>
      )}
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), rotation: Math.round(b.rotation * 10) / 10 });
