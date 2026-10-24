import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: string;
  label: string;
  value: number;
  min: number;
  max: number;
  nudges: number[];
  anchor: HTMLElement;
  onSave: (value: number) => Promise<void>;
  onClose: () => void;
}

/** One-number popover for quick edits from the card (gold, potions). Enter saves, Esc closes. */
export function QuickEditor({ title, label, value, min, max, nudges, anchor, onSave, onClose }: Props) {
  const [v, setV] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const box = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const w = 260, h = box.current?.offsetHeight ?? 200;
    let top = r.bottom + 10;
    if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 10);
    setPos({ left: Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)), top });
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
    const n = Number(v);
    setV(String(Math.max(min, Math.min(max, (Number.isFinite(n) ? n : value) + d))));
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(v);
    if (v.trim() === '' || !Number.isInteger(n)) return setError('请输入整数');
    if (n < min || n > max) return setError(`要在 ${min}–${max} 之间`);
    if (n === value) return onClose();
    setSaving(true);
    try { await onSave(n); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败，请再试一次'); setSaving(false); }
  };

  return createPortal(
    <form ref={box} className="hp-editor quick-editor" style={pos} onSubmit={submit} aria-label={`${title}：${label}`}>
      <p className="hp-editor-title">{title}</p>
      <label htmlFor="quick-editor-input" className="quick-editor-label">{label}</label>
      <input id="quick-editor-input" ref={input} className="hp-editor-input" inputMode="numeric" value={v}
        onChange={(e) => { setV(e.target.value.replace(/\D/g, '')); setError(null); }} aria-invalid={!!error} />
      <div className="hp-editor-nudges">
        {nudges.map((d) => <button key={d} type="button" onClick={() => nudge(d)}>{d > 0 ? `+${d}` : d}</button>)}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="hp-editor-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>取消</button>
        <button type="submit" className="btn" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
      </div>
    </form>,
    document.body,
  );
}
