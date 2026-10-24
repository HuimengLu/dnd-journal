import type React from 'react';
import type { MouseEvent } from 'react';
import { CONDITIONS, HEART_COUNT, describeAttack, describePotion, heartUnits, isLowHp, type Attack, type Character, type SlotInfo } from '../../../shared/types.ts';
import { assetUrl } from '../api.ts';
import { attackIcon } from '../icons.ts';
import portraitPlaceholder from '../assets/figma/portrait-placeholder.svg';
import goldIcon from '../assets/figma/gold-icon.svg';
import heartFilled from '../assets/figma/heart-filled.svg';
import heartLow from '../assets/figma/heart-low.svg';
import heartEmpty from '../assets/figma/heart-empty.svg';
import badge from '../assets/figma/badge.svg';
import badgeEmpty from '../assets/figma/badge-empty.png';
import iconPotion from '../assets/figma/icon-potion.svg';
import iconNoPotion from '../assets/figma/icon-no-potion.svg';

/** Native card size from the Figma frame; callers scale it with CSS transforms. */
export const CARD_W = 377;
export const CARD_H = 444;

interface Props {
  character: Character;
  onOpen?: () => void;
  /** Click on the HP number below the hearts; receives the clicked element for anchoring the editor. */
  onEditHp?: (anchor: HTMLElement) => void;
  canEditHp?: boolean;
  /** Single-click quick edits (DM): gold and potion count. */
  onQuickEdit?: (field: 'gold' | 'potions', anchor: HTMLElement) => void;
  /** Hover hint (null when the pointer leaves) and click-to-open note for attack/potion slots. */
  onSlotHover?: (info: SlotInfo | null, anchor?: HTMLElement) => void;
  onSlotOpen?: (info: SlotInfo, anchor: HTMLElement) => void;
}

export function CharacterCard({ character: c, onOpen, onEditHp, canEditHp, onQuickEdit, onSlotHover, onSlotOpen }: Props) {
  /** Hover and click wiring for a slot; clicks on the quick-edit badge are left alone. */
  const slotProps = (info: SlotInfo) => ({
    tabIndex: onSlotOpen ? 0 : undefined,
    role: onSlotOpen ? 'button' : undefined,
    'aria-label': `${info.title}：${info.summary}`,
    onMouseEnter: (e: MouseEvent<HTMLDivElement>) => onSlotHover?.(info, e.currentTarget),
    onMouseLeave: () => onSlotHover?.(null),
    onClick: (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('.cc-quick') || !onSlotOpen) return;
      e.stopPropagation();
      onSlotHover?.(null);
      onSlotOpen(info, e.currentTarget);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (onSlotOpen && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation(); onSlotOpen(info, e.currentTarget); }
    },
  });

  const low = isLowHp(c.hpCurrent, c.hpMax);
  const down = c.conditions.includes('unconscious');
  const units = heartUnits(c.hpCurrent, c.hpMax);
  const pct = c.hpMax > 0 ? Math.max(0, Math.min(1, c.hpCurrent / c.hpMax)) : 0;
  const conds = c.conditions.map((id) => CONDITIONS.find((x) => x.id === id)!).filter(Boolean);
  const slots: (Attack | null)[] = [0, 1, 2].map((i) => c.attacks[i] ?? null);

  const editHp = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onEditHp?.(e.currentTarget);
  };

  const hpLabel = `生命值 ${c.hpCurrent} / ${c.hpMax}${c.hpTemp ? `，临时 ${c.hpTemp}` : ''}${low ? '，低血量' : ''}`;

  return (
    <article
      className={`cc${low ? ' cc--low' : ''}${down ? ' cc--down' : ''}`}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (onOpen && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen(); } }}
      tabIndex={onOpen ? 0 : undefined}
      role={onOpen ? 'button' : undefined}
      aria-label={`${c.name}，${c.level} 级 ${c.className}，${hpLabel}${onOpen ? '，双击或回车查看详情' : ''}`}
    >
      {conds.length > 0 && (
        <ul className="cc-conds" aria-label="状态">
          {conds.slice(0, 3).map((k) => (
            <li key={k.id} className={`cc-cond${k.id === 'unconscious' ? ' cc-cond--critical' : ''}`}>
              <span aria-hidden="true">{k.glyph}</span> {k.label}
            </li>
          ))}
          {conds.length > 3 && <li className="cc-cond">+{conds.length - 3}</li>}
        </ul>
      )}

      <div className="cc-body">
        <header className="cc-head">
          <div className="cc-portrait">
            {c.portraitAssetId ? (
              <div className="cc-portrait-photo"><img src={assetUrl(c.portraitAssetId)} alt="" /></div>
            ) : (
              <img className="cc-portrait-placeholder" src={portraitPlaceholder} alt="" />
            )}
            <span className="cc-ac" title="护甲等级 AC">
              <svg width="42" height="44" viewBox="0 0 42 44" aria-hidden="true" className="rough">
                <path d="M21 3 L37 8.5 V21 C37 31 29.5 37.5 21 41 C12.5 37.5 5 31 5 21 V8.5 Z" fill="#FCFBF8" stroke="#33358C" strokeWidth="3" strokeLinejoin="round" />
              </svg>
              <span className="cc-ac-label">AC</span>
              <span className="cc-ac-value">{c.ac}</span>
            </span>
          </div>
          <div className="cc-ident">
            <p className="cc-name">{c.name}</p>
            {c.className && <p className="cc-class">{c.className}</p>}
            <div className="cc-meta">
              <p className="cc-level">LVL.{c.level}</p>
              {onQuickEdit ? (
                <button type="button" className="cc-gold cc-quick" onClick={(e) => { e.stopPropagation(); onQuickEdit('gold', e.currentTarget); }} aria-label={`金币 ${c.gold}，点击修改`}>
                  <img src={goldIcon} alt="" width={24} height={24} />
                  <p>{c.gold}</p>
                </button>
              ) : (
                <div className="cc-gold" title="金币">
                  <img src={goldIcon} alt="" width={24} height={24} />
                  <p>{c.gold}</p>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="cc-lower">
          <div className="cc-vitals">
            <div className="cc-hearts">
              <ol className="cc-heart-list" aria-hidden="true">
                {Array.from({ length: HEART_COUNT }, (_, i) => {
                  const fromBottom = HEART_COUNT - 1 - i; // fill from the bottom up
                  const state = units >= (fromBottom + 1) * 2 ? 'full' : units === fromBottom * 2 + 1 ? 'half' : 'empty';
                  const filled = low ? heartLow : heartFilled;
                  return (
                    <li key={i} className="cc-heart">
                      <img src={state === 'full' ? filled : heartEmpty} alt="" />
                      {state === 'half' && <img className="cc-heart-half" src={filled} alt="" />}
                    </li>
                  );
                })}
              </ol>
              {canEditHp ? (
                <button type="button" className="cc-hp-value cc-hp-value--edit" onClick={editHp} aria-label={`${hpLabel}，点击编辑`}>
                  {c.hpCurrent}/{c.hpMax}
                </button>
              ) : (
                <p className="cc-hp-value" aria-label={hpLabel}>{c.hpCurrent}/{c.hpMax}</p>
              )}
            </div>
            <div className="cc-bar-col">
              <div className="cc-bar" onClick={canEditHp ? (e) => { e.stopPropagation(); onEditHp?.(e.currentTarget); } : undefined}>
                <div className="cc-bar-frame rough" />
                <div className="cc-bar-track">
                  <div className="cc-bar-fill" style={{ height: `${pct * 100}%` }} />
                </div>
                {c.hpTemp > 0 && <span className="cc-temp" title="临时生命值">+{c.hpTemp}</span>}
              </div>
              <p className="cc-bar-label">LP</p>
            </div>
          </div>

          <div className="cc-slots">
            {slots.map((a, i) =>
              a ? (
                <div key={i} className="cc-slot cc-slot--info" {...slotProps(describeAttack(a))}>
                  <div className="cc-slot-frame rough" />
                  <p className="cc-slot-label">{a.name}</p>
                  <img className={`cc-slot-icon cc-slot-icon--${a.icon}`} src={attackIcon(a.icon)} alt="" />
                  <div className="cc-badge">
                    <img src={badge} alt="" />
                    <span className={a.badge.length > 3 ? 'cc-badge-text cc-badge-text--sm' : 'cc-badge-text'}>{a.badge}</span>
                  </div>
                </div>
              ) : (
                <div key={i} className="cc-slot cc-slot--empty" aria-label="空攻击格">
                  <div className="cc-slot-frame cc-slot-frame--dashed rough" />
                </div>
              ),
            )}
            {c.potions > 0 ? (
              <div className="cc-slot cc-slot--info" {...slotProps(describePotion(c.potions))}>
                <div className="cc-slot-frame rough" />
                <p className="cc-slot-label">Potion</p>
                <img className="cc-slot-icon" src={iconPotion} alt="" />
                <PotionBadge img={badge} count={c.potions} onQuickEdit={onQuickEdit} />
              </div>
            ) : (
              <div className="cc-slot cc-slot--none cc-slot--info" {...slotProps(describePotion(0))}>
                <div className="cc-slot-frame cc-slot-frame--dashed cc-slot-frame--grey rough" />
                <p className="cc-slot-label">No potion</p>
                <img className="cc-slot-icon" src={iconNoPotion} alt="" />
                <PotionBadge img={badgeEmpty} count={0} onQuickEdit={onQuickEdit} />
              </div>
            )}
          </div>
        </div>
      </div>

      <span className="cc-curl" aria-hidden="true" />
      {down && (
        <div className="cc-stamp" aria-hidden="true">
          <span>昏迷</span>
          <small>UNCONSCIOUS</small>
        </div>
      )}
    </article>
  );
}

function PotionBadge({ img, count, onQuickEdit }: { img: string; count: number; onQuickEdit?: Props['onQuickEdit'] }) {
  const inner = (
    <>
      <img src={img} alt="" width={40} height={40} />
      <span className="cc-badge-text">×{count}</span>
    </>
  );
  return onQuickEdit ? (
    <button type="button" className="cc-badge cc-quick" onClick={(e) => { e.stopPropagation(); onQuickEdit('potions', e.currentTarget); }} aria-label={`药水 ${count} 瓶，点击修改`}>
      {inner}
    </button>
  ) : (
    <div className="cc-badge">{inner}</div>
  );
}
