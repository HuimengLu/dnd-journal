import React, { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Character, OverviewPosition, Role, SlotInfo } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { CARD_H, CARD_W, CharacterCard } from './CharacterCard.tsx';
import { PAGE_W, SPREAD, useStageScale } from './Notebook.tsx';
import { useToast } from './Toasts.tsx';

interface Props {
  characters: Character[];
  positions: OverviewPosition[];
  role: Role;
  onOpen: (id: string) => void;
  onEditHp: (id: string, anchor: HTMLElement) => void;
  onQuickEdit: (id: string, field: 'gold' | 'potions', anchor: HTMLElement) => void;
  onSlotHover: (info: SlotInfo | null, anchor?: HTMLElement) => void;
  onSlotOpen: (info: SlotInfo, anchor: HTMLElement) => void;
  onAddCharacter: () => void;
}

const TILT = [-1.2, 0.8, 0.6, -0.9, 1, -0.6, -1, 0.7];

/** Default spots: cards flow left page → right page, two columns each, block centred vertically. */
function layout(count: number) {
  const roomy = count <= 8;
  const cols = roomy ? 2 : 3, maxRows = roomy ? 2 : 3;
  const scale = roomy ? 0.78 : 0.5;
  const w = CARD_W * scale, h = CARD_H * scale;
  const perPage = cols * maxRows;
  const gapX = (PAGE_W - cols * w) / (cols + 1);
  const gapY = roomy ? 26 : 20;
  const rows = Math.min(maxRows, Math.ceil(Math.min(count, perPage) / cols));
  const blockH = rows * h + (rows - 1) * gapY;
  const top = (SPREAD.h - blockH) / 2;
  const at = (i: number) => {
    const pageIdx = Math.floor(i / perPage) % 2, k = i % perPage;
    const col = k % cols, row = Math.floor(k / cols);
    return { x: pageIdx * PAGE_W + gapX + col * (w + gapX), y: top + row * (h + gapY) };
  };
  return { scale, w, h, at };
}

type Drag = { id: string; startX: number; startY: number; from: { x: number; y: number }; moved: boolean; last?: { x: number; y: number } };

export function OverviewPage({ characters, positions, role, onOpen, onEditHp, onQuickEdit, onSlotHover, onSlotOpen, onAddCharacter }: Props) {
  const isDm = role === 'dm';
  const stageScale = useStageScale();
  const toast = useToast();
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<Record<string, { x: number; y: number }>>({});
  const [lifted, setLifted] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Character | null>(null);
  const [deleting, setDeleting] = useState(false);

  // clicking anywhere that is not a card (or the confirm dialog) clears the selection
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.('.card-slot, .confirm')) setSelected(null); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const remove = async (c: Character) => {
    setDeleting(true);
    try {
      await api.deleteCharacter(c.id);
      toast({ tone: 'info', message: `已删除 ${c.name}` });
      setConfirming(null);
      setSelected(null);
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : '删除失败' });
    } finally {
      setDeleting(false);
    }
  };

  // forget drafts once the saved position matches
  useEffect(() => {
    setDraft((d) => {
      const next = { ...d };
      for (const p of positions) if (next[p.characterId] && next[p.characterId].x === p.x && next[p.characterId].y === p.y) delete next[p.characterId];
      return next;
    });
  }, [positions]);

  if (characters.length === 0) {
    return (
      <div className="empty-note" style={{ left: 120, top: 200 }}>
        <p className="empty-note-title">还没有角色</p>
        {isDm ? (
          <>
            <p>导入每位玩家的角色卡 PDF，或手动创建角色，卡片就会出现在这里。</p>
            <button type="button" className="btn" onClick={onAddCharacter}>＋ 添加角色</button>
          </>
        ) : (
          <p>DM 还没有添加角色。添加后，这里会实时出现大家的角色卡。</p>
        )}
      </div>
    );
  }

  const L = layout(characters.length);
  const saved = new Map(positions.map((p) => [p.characterId, p]));
  const pos = (c: Character, i: number) => draft[c.id] ?? saved.get(c.id) ?? L.at(i);
  const z = (c: Character) => (lifted === c.id ? 10_000 : saved.get(c.id)?.z ?? 0);

  const begin = (e: ReactPointerEvent, c: Character, i: number) => {
    if (!isDm || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.cc-hp-value--edit, .cc-bar, .cc-quick, .card-delete')) return; // quick edits, not dragging
    drag.current = { id: c.id, startX: e.clientX, startY: e.clientY, from: pos(c, i), moved: false };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / stageScale, dy = (e.clientY - d.startY) / stageScale;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { setLifted(d.id); try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer already released */ } }
    d.moved = true;
    const x = Math.round(clamp(d.from.x + dx, -L.w + 60, SPREAD.w - 60));
    const y = Math.round(clamp(d.from.y + dy, -L.h + 60, SPREAD.h - 60));
    d.last = { x, y };
    setDraft((m) => ({ ...m, [d.id]: { x, y } }));
  };
  const end = async (c: Character) => {
    const d = drag.current;
    drag.current = null;
    setLifted(null);
    if (!d) return;
    if (!d.moved) { setSelected(c.id); return; } // a plain click selects (and does quick edits); details open on double-click
    const p = d.last; // state may lag a render behind the last pointer move
    if (!p) return;
    try {
      await api.moveOverviewCard(c.id, p.x, p.y);
    } catch (err) {
      setDraft((m) => { const n = { ...m }; delete n[c.id]; return n; });
      toast({ tone: 'error', message: err instanceof Error ? err.message : '位置没有保存' });
    }
  };

  return (
    <div className={`ov${isDm ? ' ov--dm' : ''}`}>
      {characters.map((c, i) => {
        const p = pos(c, i);
        return (
          <div
            key={c.id}
            className={`card-slot${lifted === c.id ? ' card-slot--lifted' : ''}${isDm && selected === c.id ? ' card-slot--selected' : ''}`}
            style={{ left: p.x, top: p.y, width: CARD_W, height: CARD_H, zIndex: z(c), transform: `scale(${L.scale}) rotate(${TILT[i % TILT.length]}deg)` }}
            onPointerDown={(e) => begin(e, c, i)}
            onPointerMove={move}
            onPointerUp={() => end(c)}
            onPointerCancel={() => { drag.current = null; setLifted(null); }}
            onDoubleClick={isDm ? (e) => { if (!(e.target as HTMLElement).closest('.cc-quick, .cc-hp-value--edit, .cc-bar')) onOpen(c.id); } : undefined}
            {...(isDm ? { tabIndex: 0, role: 'button', 'aria-label': `${c.name}，拖动可移动，双击或回车查看详情`,
              onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen(c.id); } } } : {})}
          >
            {/* DM: drag to move, double-click for details; players: double-click the card */}
            <CharacterCard character={c} onOpen={isDm ? undefined : () => onOpen(c.id)} onEditHp={(a) => onEditHp(c.id, a)} canEditHp
              onQuickEdit={isDm ? (f, a) => onQuickEdit(c.id, f, a) : undefined} onSlotHover={lifted ? undefined : onSlotHover} onSlotOpen={onSlotOpen} />
            {isDm && selected === c.id && !lifted && (
              <button type="button" className="card-delete" onClick={(e) => { e.stopPropagation(); setConfirming(c); }} aria-label={`删除 ${c.name}`} title="删除角色卡">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.8l11 10.6M17.3 6.4L6.8 17.5" /></svg>
              </button>
            )}
          </div>
        );
      })}
      {confirming && createPortal(
        <div className="confirm-veil" onPointerDown={(e) => { if (e.target === e.currentTarget && !deleting) setConfirming(null); }}>
          <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body">
            <p id="confirm-title" className="confirm-title">删除这张角色卡？</p>
            <p id="confirm-body" className="confirm-body">会删除「{confirming.name}」，并把它从所有页面上移除。这一步不能撤销。</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn--ghost" autoFocus onClick={() => setConfirming(null)} disabled={deleting}>取消</button>
              <button type="button" className="btn btn--danger" onClick={() => remove(confirming)} disabled={deleting}>{deleting ? '删除中…' : '删除'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
