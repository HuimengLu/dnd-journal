import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ABILITIES, CONDITIONS, type Character, type CharacterInput, type ConditionId, type Role } from '../../../shared/types.ts';
import { api, assetUrl } from '../api.ts';
import { CharacterForm } from './CharacterForm.tsx';
import { useToast } from './Toasts.tsx';
import portraitPlaceholder from '../assets/figma/portrait-placeholder.svg';

interface Props {
  character: Character;
  role: Role;
  onClose: () => void;
  onUpdate: (patch: Partial<CharacterInput>, label: string) => Promise<void>;
  onDeleted: () => void;
}

const mod = (score: number) => { const m = Math.floor((score - 10) / 2); return m >= 0 ? `+${m}` : `${m}`; };
const ABILITY_CN: Record<string, string> = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' };
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toUpperCase();

/** Character details as a centred sheet over a veiled page. Closes on ✕, Esc, or a click outside. */
export function DetailPanel({ character: c, role, onClose, onUpdate, onDeleted }: Props) {
  const isDm = role === 'dm';
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [exact, setExact] = useState(String(c.hpCurrent));
  const [hpError, setHpError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeBtn.current?.focus(); }, []);
  useEffect(() => { setExact(String(c.hpCurrent)); setHpError(null); }, [c.hpCurrent, c.id]);
  useEffect(() => { setEditing(false); setConfirmDelete(false); }, [c.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (patch: Partial<CharacterInput>, label: string) => {
    try { await onUpdate(patch, label); } catch (e) { toast({ tone: 'error', message: e instanceof Error ? e.message : '保存失败' }); }
  };
  const adjust = (d: number) => run({ hpCurrent: Math.max(0, Math.min(c.hpMax, c.hpCurrent + d)) }, '生命值');
  const setExactHp = () => {
    const n = Number(exact);
    if (exact.trim() === '' || !Number.isInteger(n)) return setHpError('请输入整数');
    if (n < 0 || n > c.hpMax) return setHpError(`要在 0–${c.hpMax} 之间`);
    setHpError(null);
    if (n !== c.hpCurrent) run({ hpCurrent: n }, '生命值');
  };
  const toggleCondition = (id: ConditionId) =>
    run({ conditions: c.conditions.includes(id) ? c.conditions.filter((x) => x !== id) : [...c.conditions, id] }, '状态');

  const remove = async () => {
    try { await api.deleteCharacter(c.id); onDeleted(); toast({ tone: 'info', message: `已删除 ${c.name}` }); }
    catch (e) { toast({ tone: 'error', message: e instanceof Error ? e.message : '删除失败' }); }
  };

  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = c;
  const down = c.conditions.includes('unconscious');

  return (
    <div className="detail-veil" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <article className="detail" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <button ref={closeBtn} type="button" className="detail-close" onClick={onClose} aria-label="关闭">✕</button>

        <header className="detail-meta">
          <span>UPDATED {time(c.updatedAt)}</span>
          <span>{editing ? 'EDIT CHARACTER' : 'CHARACTER SHEET'}</span>
        </header>

        <div className="detail-hero">
          <div>
            <h2 id="detail-title" className="detail-title">{c.name}.</h2>
            <p className="detail-lede">{c.level} 级 {c.className || '（未填职业）'}</p>
          </div>
          <div className="detail-portrait">
            <img src={c.portraitAssetId ? assetUrl(c.portraitAssetId) : portraitPlaceholder} alt={c.portraitAssetId ? `${c.name} 的头像` : ''} />
          </div>
        </div>

        {editing ? (
          <div className="detail-edit">
            <CharacterForm
              initial={input}
              submitLabel="保存修改"
              onSubmit={async (v) => { await onUpdate(v, '角色信息'); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <div className="detail-rows">
            <Row label="HIT POINTS" sub="生命值">
              <p className={`detail-hp${c.hpCurrent === 0 ? ' detail-hp--zero' : ''}`}>
                {c.hpCurrent}<span> / {c.hpMax}</span>
                {c.hpTemp > 0 && <em className="detail-temp">+{c.hpTemp} 临时</em>}
              </p>
              <div className="detail-hp-controls">
                {[-10, -5, -1, +1, +5, +10].map((d) => (
                  <button key={d} type="button" className="detail-chip" onClick={() => adjust(d)} disabled={(d < 0 && c.hpCurrent === 0) || (d > 0 && c.hpCurrent === c.hpMax)}>
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
              <form className="detail-inline" onSubmit={(e) => { e.preventDefault(); setExactHp(); }}>
                <label htmlFor="detail-exact">设为</label>
                <input id="detail-exact" inputMode="numeric" value={exact} onChange={(e) => setExact(e.target.value.replace(/\D/g, ''))} aria-invalid={!!hpError} />
                <button type="submit" className="detail-chip">确定</button>
                <label htmlFor="detail-temp" className="detail-inline-gap">临时生命值</label>
                <input id="detail-temp" key={`t-${c.hpTemp}`} inputMode="numeric" defaultValue={c.hpTemp}
                  onBlur={(e) => { const t = Number(e.target.value || 0); if (Number.isInteger(t) && t >= 0 && t !== c.hpTemp) run({ hpTemp: t }, '临时生命值'); }} />
              </form>
              {hpError && <p className="form-error" role="alert">{hpError}</p>}
              {c.hpCurrent === 0 && !down && isDm && (
                <p className="detail-note">生命值归零。<button type="button" className="link" onClick={() => toggleCondition('unconscious')}>标记为昏迷</button></p>
              )}
            </Row>

            <Row label="DEFENCE" sub="护甲与速度">
              <dl className="detail-stats">
                <div><dt>AC</dt><dd>{c.ac}</dd></div>
                <div><dt>速度</dt><dd>{c.speed}<small> 尺</small></dd></div>
                <div><dt>金币</dt><dd>{c.gold}<small> GP</small></dd></div>
                <div><dt>药水</dt><dd>{c.potions}</dd></div>
              </dl>
            </Row>

            <Row label="CONDITIONS" sub="状态">
              {isDm ? (
                <div className="detail-conds">
                  {CONDITIONS.map((k) => {
                    const on = c.conditions.includes(k.id);
                    return (
                      <button key={k.id} type="button" aria-pressed={on} onClick={() => toggleCondition(k.id)}
                        className={`detail-cond${on ? ' detail-cond--on' : ''}${k.id === 'unconscious' ? ' detail-cond--critical' : ''}`}>
                        <span aria-hidden="true">{k.glyph}</span> {k.label}
                      </button>
                    );
                  })}
                </div>
              ) : c.conditions.length ? (
                <ul className="detail-conds">
                  {c.conditions.map((id) => {
                    const k = CONDITIONS.find((x) => x.id === id)!;
                    return <li key={id} className={`detail-cond detail-cond--on${id === 'unconscious' ? ' detail-cond--critical' : ''}`}><span aria-hidden="true">{k.glyph}</span> {k.label}</li>;
                  })}
                </ul>
              ) : (
                <p className="detail-muted">没有状态</p>
              )}
            </Row>

            <Row label="ABILITIES" sub="属性值">
              <dl className="detail-abilities">
                {ABILITIES.map((a) => (
                  <div key={a}>
                    <dt>{a.toUpperCase()} <span>{ABILITY_CN[a]}</span></dt>
                    <dd><strong>{mod(c.abilities[a])}</strong> <span>{c.abilities[a]}</span></dd>
                  </div>
                ))}
              </dl>
            </Row>

            <Row label="ATTACKS" sub="攻击方式">
              {c.attacks.length ? (
                <ul className="detail-attacks">
                  {c.attacks.map((a, i) => <li key={i}><span>{a.name}</span><span className="detail-mono">{a.badge}</span></li>)}
                </ul>
              ) : (
                <p className="detail-muted">还没有设置攻击方式</p>
              )}
            </Row>


            {isDm && (
              <footer className="detail-actions">
                <button type="button" className="btn" onClick={() => setEditing(true)}>编辑角色信息</button>
                {confirmDelete ? (
                  <span className="detail-confirm">
                    会从所有页面移除这张卡。
                    <button type="button" className="btn btn--danger" onClick={remove}>确认删除</button>
                    <button type="button" className="link" onClick={() => setConfirmDelete(false)}>取消</button>
                  </span>
                ) : (
                  <button type="button" className="link link--danger" onClick={() => setConfirmDelete(true)}>删除角色</button>
                )}
              </footer>
            )}

            <section className="detail-sheet" aria-label="原始角色卡">
              <div className="detail-sheet-head">
                <div className="detail-label"><span>ORIGINAL SHEET</span><small>原始角色卡</small></div>
                {c.pdfAssetId && <a className="detail-link" href={assetUrl(c.pdfAssetId)} target="_blank" rel="noreferrer">打开 PDF ↗</a>}
              </div>
              {c.sheetPageAssetIds.length > 0 ? (
                <div className="detail-sheet-pages">
                  {c.sheetPageAssetIds.map((id, i) => (
                    <a key={id} href={assetUrl(id)} target="_blank" rel="noreferrer" title="打开原图">
                      <img src={assetUrl(id)} alt={`${c.name} 的角色卡第 ${i + 1} 页`} loading="lazy" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="detail-muted">{c.pdfAssetId ? '正在把 PDF 转成图片，稍等片刻会出现在这里。' : '这个角色是手动创建的，没有 PDF。'}</p>
              )}
            </section>
          </div>
        )}
      </article>
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub: string; children: ReactNode }) {
  return (
    <section className="detail-row">
      <div className="detail-label">
        <span>{label}</span>
        <small>{sub}</small>
      </div>
      <div className="detail-content">{children}</div>
    </section>
  );
}
