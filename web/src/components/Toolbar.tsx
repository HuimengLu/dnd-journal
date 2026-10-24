import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DiceRoll, Role } from '../../../shared/types.ts';
import { DICE_SIDES, parseExpression } from '../../../shared/dice.ts';
import { api } from '../api.ts';
import { STICKERS, STICKER_DRAG_TYPE, type Sticker } from '../stickers.ts';
import { useToast } from './Toasts.tsx';

type Tool = 'dice' | 'stickers' | null;
const ROLLER_STORAGE = 'campaign-journal-roller';

interface Props {
  role: Role;
  rolls: DiceRoll[];
  onAddCharacter: () => void;
  onPlaceSticker: (s: Sticker) => void;
  /** DM picked an image file: it goes onto a new journal page. */
  onAddImage: (file: File) => void;
  /** Called with the id of each roll this browser made, so the app doesn't toast it back. */
  onRolled: (id: string) => void;
}

/** Floating tool panel on the left of the journal: add character (DM), dice, stickers (DM). */
export function Toolbar({ role, rolls, onAddCharacter, onPlaceSticker, onAddImage, onRolled }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const isDm = role === 'dm';
  const [tool, setTool] = useState<Tool>(null);
  const panel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!tool) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !bar.current?.contains(t)) setTool(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTool(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [tool]);

  const toggle = (t: Exclude<Tool, null>) => setTool((cur) => (cur === t ? null : t));

  // the bar sits inside the scaled notebook stage; the panel opens beside it in screen space
  const [panelPos, setPanelPos] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });
  useLayoutEffect(() => {
    if (!tool || !bar.current) return;
    const place = () => {
      const r = bar.current!.getBoundingClientRect();
      setPanelPos({ left: r.right + 14, bottom: Math.max(12, window.innerHeight - r.bottom) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [tool]);

  return (
    <>
      <nav ref={bar} className="toolbar" aria-label="工具">
        {isDm && (
          <button type="button" className="tool" onClick={() => { setTool(null); onAddCharacter(); }} aria-label="添加角色" data-tip="添加角色">
            <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M11.2 4.6c2.3-.3 4 1.4 4 3.6s-1.6 3.9-3.8 3.9-3.9-1.7-3.8-3.9c.1-2 1.5-3.4 3.6-3.6z" /><path d="M4.3 21.8c.6-4.2 3.5-6.6 7.1-6.5 3.5.1 6.2 2.5 6.8 6.4" /><path d="M21.4 7.2l.2 6.3M18.3 10.4l6.2-.1" /></svg>
          </button>
        )}
        <button type="button" className={`tool${tool === 'dice' ? ' tool--on' : ''}`} onClick={() => toggle('dice')} aria-pressed={tool === 'dice'} aria-label="掷骰子" data-tip="掷骰子">
          <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 3.2l8.6 4.7.2 10.1-8.7 5.1-8.8-4.9-.1-10.2z" /><path d="M14 8.3l4.9 8.3-9.9.2z" /><path d="M14 3.2v5.1M22.6 18.1l-3.7-1.5M5.3 18.2l3.7-1.6M9 16.8L5.2 8M18.9 16.6l3.7-8.7" /></svg>
        </button>
        {isDm && (
          <button type="button" className={`tool${tool === 'stickers' ? ' tool--on' : ''}`} onClick={() => toggle('stickers')} aria-pressed={tool === 'stickers'} aria-label="贴贴纸" data-tip="贴贴纸">
            <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M22.8 15.2l-.2-8.8c0-1.9-1.3-3.2-3.2-3.2L7.1 3.4C5.3 3.4 4 4.7 4.1 6.6l.1 12.6c0 1.8 1.4 3.1 3.2 3.1l7.9-.1z" /><path d="M15.3 22.2l.1-4.3c0-1.5 1.1-2.6 2.6-2.6l4.8-.1" /><path d="M9.8 12.9c1 1.3 2.6 1.9 4.3 1.6" /><circle className="fill" cx="10.3" cy="9" r="1" /><circle className="fill" cx="16.4" cy="8.8" r="1" /></svg>
          </button>
        )}
        {isDm && (
          <>
            <button type="button" className="tool" onClick={() => { setTool(null); fileInput.current?.click(); }} aria-label="添加图片到新页面" data-tip="添加图片">
              <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M17.6 5.1L6.3 5.3C4.9 5.3 4 6.3 4 7.6l.2 11.8c0 1.3 1 2.2 2.3 2.2l13.2-.2c1.3 0 2.2-1 2.2-2.3l-.1-6.6" /><path d="M4.4 17.6l5.3-5.2 4.1 4.1 2.6-2.4 5.3 5.1" /><circle cx="10.4" cy="9.6" r="1.6" /><path d="M21.6 3.4l.1 6.2M18.5 6.6l6.2-.1" /></svg>
            </button>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAddImage(f); }} />
          </>
        )}
      </nav>

      {tool && createPortal(
        <div ref={panel} className="tool-panel" style={panelPos} role="dialog" aria-label={tool === 'dice' ? '掷骰子' : '贴纸'}>
          {tool === 'dice' ? (
            <DiceTray role={role} rolls={rolls} onRolled={onRolled} onClose={() => setTool(null)} />
          ) : (
            <StickerDrawer onPick={onPlaceSticker} onClose={() => setTool(null)} />
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

function DiceTray({ role, rolls, onRolled, onClose }: { role: Role; rolls: DiceRoll[]; onRolled: (id: string) => void; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(() => { try { return localStorage.getItem(ROLLER_STORAGE) ?? ''; } catch { return ''; } });
  const [expr, setExpr] = useState('1d20');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<DiceRoll | null>(null);

  const saveName = (v: string) => { setName(v); try { localStorage.setItem(ROLLER_STORAGE, v); } catch { /* ignore */ } };

  const roll = async (expression: string) => {
    const parsed = parseExpression(expression);
    if ('error' in parsed) return setError(parsed.error);
    setError(null);
    setBusy(true);
    try {
      const r = await api.rollDice(parsed.text, name.trim() || (role === 'dm' ? 'DM' : '玩家'));
      onRolled(r.id);
      setMine(r);
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : '掷骰失败' });
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); roll(expr); };
  const latest = mine ?? rolls[0] ?? null;

  return (
    <>
      <header className="tool-panel-head">
        <h2>掷骰子</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
      </header>
      <label className="dice-name" htmlFor="dice-name">
        署名
        <input id="dice-name" value={name} maxLength={16} placeholder={role === 'dm' ? 'DM' : '你的名字'} onChange={(e) => saveName(e.target.value)} />
      </label>
      <div className="dice-quick">
        {DICE_SIDES.map((s) => (
          <button key={s} type="button" className="dice-btn" disabled={busy} onClick={() => { setExpr(`1d${s}`); roll(`1d${s}`); }}>d{s}</button>
        ))}
      </div>
      <form className="dice-form" onSubmit={submit}>
        <label htmlFor="dice-expr" className="sr-only">骰子表达式</label>
        <input id="dice-expr" value={expr} onChange={(e) => { setExpr(e.target.value); setError(null); }} placeholder="2d6+3" aria-invalid={!!error} />
        <button type="submit" className="btn" disabled={busy}>掷</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}

      {latest && (
        <div className="dice-result" aria-live="polite">
          <p className="dice-result-total">{latest.total}</p>
          <p className="dice-result-expr">{latest.roller} · {latest.expression}</p>
          <p className="dice-result-parts">
            {latest.terms.flatMap((t, ti) => t.results.map((v, vi) => (
              <span key={`${ti}-${vi}`} className={`die${v === t.sides ? ' die--max' : v === 1 ? ' die--min' : ''}`} title={`d${t.sides}`}>{t.sign < 0 ? '−' : ''}{v}</span>
            )))}
            {latest.modifier !== 0 && <span className="dice-mod">{latest.modifier > 0 ? `+${latest.modifier}` : `−${-latest.modifier}`}</span>}
          </p>
        </div>
      )}

      {rolls.length > 0 && (
        <ol className="dice-log" aria-label="最近的掷骰">
          {rolls.slice(0, 8).map((r) => (
            <li key={r.id}>
              <span className="dice-log-who">{r.roller}</span>
              <span className="dice-log-expr">{r.expression}</span>
              <strong>{r.total}</strong>
              <time>{new Date(r.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function StickerDrawer({ onPick, onClose }: { onPick: (s: Sticker) => void; onClose: () => void }) {
  return (
    <>
      <header className="tool-panel-head">
        <h2>贴纸</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
      </header>
      <p className="tool-panel-hint">点一下贴到当前页，或者直接拖到本子上想贴的位置。之后可以拖动、缩放或移除。</p>
      <div className="sticker-grid">
        {STICKERS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="sticker-pick"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(STICKER_DRAG_TYPE, s.id);
              e.dataTransfer.effectAllowed = 'copy';
              const img = e.currentTarget.querySelector('img');
              if (img) e.dataTransfer.setDragImage(img, img.clientWidth / 2, img.clientHeight / 2);
            }}
            onClick={() => onPick(s)}
            title={s.name}
            aria-label={`贴上 ${s.name}`}
          >
            <img src={s.url} alt="" />
          </button>
        ))}
      </div>
    </>
  );
}
