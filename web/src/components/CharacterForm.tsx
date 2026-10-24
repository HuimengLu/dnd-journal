import { useState, type FormEvent } from 'react';
import { ABILITIES, ATTACK_ICONS, type AttackIcon, type CharacterInput } from '../../../shared/types.ts';
import { api, ApiError, assetUrl } from '../api.ts';
import { ICON_LABELS } from '../icons.ts';

interface Props {
  initial: CharacterInput;
  /** Fields the PDF parser could not read; highlighted so the DM checks them. */
  missing?: string[];
  submitLabel: string;
  onSubmit: (input: CharacterInput) => Promise<void>;
  onCancel: () => void;
}

const ABILITY_LABEL: Record<string, string> = { str: '力量 STR', dex: '敏捷 DEX', con: '体质 CON', int: '智力 INT', wis: '感知 WIS', cha: '魅力 CHA' };

/** Editable character fields — the import preview and the DM's edit form. */
export function CharacterForm({ initial, missing = [], submitLabel, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<CharacterInput>(initial);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof CharacterInput>(k: K, val: CharacterInput[K]) => { setV((p) => ({ ...p, [k]: val })); setError(null); };
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
  const flag = (k: string) => (missing.includes(k) ? ' field--missing' : '') + (error?.field === k || error?.field?.startsWith(`${k}.`) ? ' field--error' : '');

  const numberField = (k: 'level' | 'hpMax' | 'hpCurrent' | 'hpTemp' | 'ac' | 'speed' | 'gold' | 'potions', label: string) => (
    <label className={`field${flag(k)}`} htmlFor={`cf-${k}`}>
      <span>{label}</span>
      <input id={`cf-${k}`} inputMode="numeric" value={Number.isFinite(v[k]) ? v[k] : ''} onChange={(e) => set(k, num(e.target.value.replace(/\D/g, '')))} />
    </label>
  );

  const setAttack = (i: number, patch: Partial<CharacterInput['attacks'][number]>) =>
    set('attacks', v.attacks.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const uploadPortrait = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try { const a = await api.uploadImage(file); set('portraitAssetId', a.id); }
    catch (e) { setError({ message: e instanceof Error ? e.message : '上传失败', field: 'portraitAssetId' }); }
    finally { setUploading(false); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setError({ message: '请填写角色姓名', field: 'name' });
    if (v.hpCurrent > v.hpMax) return setError({ message: '当前生命值不能超过最大生命值', field: 'hpCurrent' });
    setSaving(true);
    try {
      await onSubmit(v);
    } catch (err) {
      setError(err instanceof ApiError ? { message: err.message, field: err.field } : { message: '保存失败，请再试一次' });
      setSaving(false);
    }
  };

  return (
    <form className="cform" onSubmit={submit} noValidate>
      {missing.length > 0 && <p className="form-hint">标黄的字段没能从角色卡里读出来，请检查后再保存。</p>}

      <div className="cform-portrait">
        <div className="cform-portrait-preview">{v.portraitAssetId ? <img src={assetUrl(v.portraitAssetId)} alt="头像预览" /> : <span>无头像</span>}</div>
        <label className="btn btn--ghost" htmlFor="cf-portrait">{uploading ? '上传中…' : v.portraitAssetId ? '更换头像' : '上传头像（可选）'}</label>
        <input id="cf-portrait" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => uploadPortrait(e.target.files?.[0])} />
        {v.portraitAssetId && <button type="button" className="link" onClick={() => set('portraitAssetId', null)}>移除</button>}
      </div>

      <div className="cform-grid">
        <label className={`field field--wide${flag('name')}`} htmlFor="cf-name">
          <span>角色姓名 *</span>
          <input id="cf-name" value={v.name} maxLength={60} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className={`field field--wide${flag('className')}`} htmlFor="cf-class">
          <span>职业</span>
          <input id="cf-class" value={v.className} maxLength={40} onChange={(e) => set('className', e.target.value)} placeholder="例如：吟游诗人（逸闻学院）" />
        </label>
        {numberField('level', '等级')}
        {numberField('ac', 'AC')}
        {numberField('speed', '速度（尺）')}
        {numberField('hpMax', '最大生命值')}
        {numberField('hpCurrent', '当前生命值')}
        {numberField('hpTemp', '临时生命值')}
        {numberField('gold', '金币 GP')}
        {numberField('potions', '药水数量')}
      </div>

      <fieldset className="cform-abilities">
        <legend>属性值</legend>
        {ABILITIES.map((a) => (
          <label key={a} className={`field${flag(a)}${error?.field === `abilities.${a}` ? ' field--error' : ''}`} htmlFor={`cf-${a}`}>
            <span>{ABILITY_LABEL[a]}</span>
            <input id={`cf-${a}`} inputMode="numeric" value={Number.isFinite(v.abilities[a]) ? v.abilities[a] : ''}
              onChange={(e) => set('abilities', { ...v.abilities, [a]: num(e.target.value.replace(/\D/g, '')) })} />
          </label>
        ))}
      </fieldset>

      <fieldset className={`cform-attacks${flag('attacks')}`}>
        <legend>角色卡上的攻击方式（最多 3 个）</legend>
        {v.attacks.map((a, i) => (
          <div key={i} className="cform-attack">
            <label className="field" htmlFor={`cf-atk-${i}`}><span>名称</span>
              <input id={`cf-atk-${i}`} value={a.name} maxLength={16} onChange={(e) => setAttack(i, { name: e.target.value })} />
            </label>
            <label className="field field--narrow" htmlFor={`cf-atk-b-${i}`}><span>命中 / DC</span>
              <input id={`cf-atk-b-${i}`} value={a.badge} maxLength={6} onChange={(e) => setAttack(i, { badge: e.target.value })} placeholder="+4" />
            </label>
            <label className="field" htmlFor={`cf-atk-i-${i}`}><span>图标</span>
              <select id={`cf-atk-i-${i}`} value={a.icon} onChange={(e) => setAttack(i, { icon: e.target.value as AttackIcon })}>
                {ATTACK_ICONS.map((ic) => <option key={ic} value={ic}>{ICON_LABELS[ic]}</option>)}
              </select>
            </label>
            <button type="button" className="link" onClick={() => set('attacks', v.attacks.filter((_, j) => j !== i))} aria-label={`删除攻击 ${a.name}`}>删除</button>
            <label className="field cform-attack-wide" htmlFor={`cf-atk-s-${i}`}><span>简介（悬停时显示）</span>
              <input id={`cf-atk-s-${i}`} value={a.summary ?? ''} maxLength={40} onChange={(e) => setAttack(i, { summary: e.target.value })} placeholder="例如：近战或投掷，命中 +4" />
            </label>
            <label className="field cform-attack-wide" htmlFor={`cf-atk-d-${i}`}><span>详细说明（点击时的纸条）</span>
              <textarea id={`cf-atk-d-${i}`} rows={2} value={a.details ?? ''} maxLength={300} onChange={(e) => setAttack(i, { details: e.target.value })} placeholder="射程、伤害、特殊效果……" />
            </label>
          </div>
        ))}
        {v.attacks.length < 3 && (
          <button type="button" className="btn btn--ghost" onClick={() => set('attacks', [...v.attacks, { name: '', badge: '', icon: 'sparkle' }])}>＋ 添加攻击方式</button>
        )}
      </fieldset>

      {error && <p className="form-error" role="alert">{error.message}</p>}
      <div className="cform-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>取消</button>
        <button type="submit" className="btn" disabled={saving || uploading}>{saving ? '保存中…' : submitLabel}</button>
      </div>
    </form>
  );
}
