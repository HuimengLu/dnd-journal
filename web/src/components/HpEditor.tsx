import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Character } from '../../../shared/types.ts';

interface Props {
  character: Character;
  anchor: HTMLElement;
  onSave: (hpCurrent: number, hpTemp: number) => Promise<void>;
  onClose: () => void;
}

/** Small popover for setting current HP exactly, opened from the number under the hearts. */
export function HpEditor({ character: c, anchor, onSave, onClose }: Props) {
  const [hp, setHp] = useState(String(c.hpCurrent));
  const [temp, setTemp] = useState(String(c.hpTemp));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const box = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const w = 280, h = box.current?.offsetHeight ?? 260;
    let left = r.left + r.width / 2 - w / 2;
    let top = r.bottom + 10;
    if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 10);
    left = Math.max(12, Math.min(window.innerWidth - w - 12, left));
    setPos({ left, top });
    input.current?.select();
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const nudge = (d: number) => {
    const n = Number(hp);
    const base = Number.isFinite(n) ? n : c.hpCurrent;
    setHp(String(Math.max(0, Math.min(c.hpMax, base + d))));
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(hp), t = Number(temp || 0);
    if (hp.trim() === '' || !Number.isInteger(n)) return setError('请输入整数');
    if (n < 0) return setError('生命值不能小于 0');
    if (n > c.hpMax) return setError(`不能超过最大生命值 ${c.hpMax}`);
    if (!Number.isInteger(t) || t < 0) return setError('临时生命值要是 0 或正整数');
    setSaving(true);
    try {
      await onSave(n, t);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请再试一次');
      setSaving(false);
    }
  };

  return createPortal(
    <form ref={box} className="hp-editor" style={pos} onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label={`编辑 ${c.name} 的生命值`}>
      <p className="hp-editor-title">{c.name}</p>
      <div className="hp-editor-main">
        <label htmlFor="hp-editor-current" className="sr-only">当前生命值</label>
        <input
          id="hp-editor-current"
          ref={input}
          className="hp-editor-input"
          inputMode="numeric"
          value={hp}
          onChange={(e) => { setHp(e.target.value.replace(/[^\d-]/g, '')); setError(null); }}
          aria-invalid={!!error}
        />
        <span className="hp-editor-max">/ {c.hpMax}</span>
      </div>
      <div className="hp-editor-nudges">
        {[-5, -1, +1, +5].map((d) => (
          <button key={d} type="button" onClick={() => nudge(d)}>{d > 0 ? `+${d}` : d}</button>
        ))}
      </div>
      <label className="hp-editor-temp" htmlFor="hp-editor-temp">
        临时生命值
        <input id="hp-editor-temp" inputMode="numeric" value={temp} onChange={(e) => { setTemp(e.target.value.replace(/\D/g, '')); setError(null); }} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="hp-editor-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>取消</button>
        <button type="submit" className="btn" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
      </div>
    </form>,
    document.body,
  );
}
