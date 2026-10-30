import type React from 'react';
import type { MouseEvent } from 'react';
import { CONDITIONS, HEART_COUNT, describeAttack, describePotion, heartSplit, isLowHp, type Attack, type Character, type SlotInfo } from '../../../shared/types.ts';
import { assetUrl } from '../api.ts';
import { cardArt, cardAttackIcon, type CardPalette } from '../icons.ts';

/** Native card size from the Figma frame (64:2467: outer frame around Character Card 64:2384); callers scale it with CSS transforms. */
export const CARD_W = 373;
export const CARD_H = 479;

/**
 * Stroke treatments, compared side by side at /?card-looks. "design" is the Figma frame as drawn (clean frame
 * lines, textured slots and art); the crayon looks run every solid stroke through a #crayon-* filter, and the
 * sketch looks use the grey ink-map palette with #sketch-* filters that thicken and thin each line like a brush pen.
 */
export type CardLook = 'sketch' | 'sketch-bold' | 'sketch-loose' | 'design' | 'crayon-fine' | 'crayon' | 'crayon-heavy' | 'crayon-streak' | 'crayon-wax';
export const DEFAULT_CARD_LOOK: CardLook = 'crayon';
export const CARD_LOOKS: { id: CardLook; label: string; note: string; palette: CardPalette }[] = [
  { id: 'sketch', label: '手绘 · 自然', note: '灰阶 + 黄 / 橙红配色，线条粗细随笔势轻微变化', palette: 'sketch' },
  { id: 'sketch-bold', label: '手绘 · 浓墨', note: '粗细对比更强，像压重了的马克笔', palette: 'sketch' },
  { id: 'sketch-loose', label: '手绘 · 随性', note: '线条更抖、更松，像快速画的草图', palette: 'sketch' },
  { id: 'design', label: '设计稿原样', note: '外框和分隔线是干净的实线，只有格子、图标、爱心带纹理', palette: 'figma' },
  { id: 'crayon-fine', label: '蜡笔 · 细腻', note: '颗粒细、缺口少，像削尖的蜡笔', palette: 'figma' },
  { id: 'crayon', label: '蜡笔 · 标准（当前使用）', note: '边缘轻微抖动，纸纹把墨色磨出小缺口', palette: 'figma' },
  { id: 'crayon-heavy', label: '蜡笔 · 粗犷', note: '颗粒更大、缺口更多，像用钝了的蜡笔', palette: 'figma' },
  { id: 'crayon-streak', label: '蜡笔 · 横纹', note: '纸纹是横向的细条，像在有纹理的纸上涂', palette: 'figma' },
  { id: 'crayon-wax', label: '蜡笔 · 油蜡', note: '边缘略微晕开，更软更厚', palette: 'figma' },
];

interface Props {
  character: Character;
  look?: CardLook;
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

export function CharacterCard({ character: c, look = DEFAULT_CARD_LOOK, onOpen, onEditHp, canEditHp, onQuickEdit, onSlotHover, onSlotOpen }: Props) {
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

  const palette = CARD_LOOKS.find((l) => l.id === look)?.palette ?? 'figma';
  const art = (name: string) => cardArt(palette, name);
  const low = isLowHp(c.hpCurrent, c.hpMax);
  const down = c.conditions.includes('unconscious');
  const hearts = heartSplit(c.hpCurrent, c.hpMax, c.hpTemp);
  /** What a half-heart unit (1-based, counted from the bottom heart's left half) shows. */
  const unitKind = (u: number) => (u <= hearts.hp ? 'hp' : u <= hearts.total ? 'temp' : 'empty');
  const heartArt = { hp: art(low ? 'heart-low' : 'heart-filled'), temp: art('heart-temp'), empty: art('heart-empty') };
  const conds = c.conditions.map((id) => CONDITIONS.find((x) => x.id === id)!).filter(Boolean);
  const slots: (Attack | null)[] = [0, 1, 2].map((i) => c.attacks[i] ?? null);

  const editHp = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onEditHp?.(e.currentTarget);
  };

  const hpLabel = `生命值 ${c.hpCurrent} / ${c.hpMax}${c.hpTemp ? `，临时 ${c.hpTemp}` : ''}${low ? '，低血量' : ''}`;

  return (
    <article
      className={`cc cc--${look} cc--palette-${palette}${low ? ' cc--low' : ''}${down ? ' cc--down' : ''}`}
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
              <img className="cc-portrait-placeholder" src={art('portrait-placeholder')} alt="" />
            )}
            <span className="cc-ac" title="护甲等级 AC">
              <svg width="42" height="44" viewBox="0 0 42 44" aria-hidden="true">
                {/* paper fill stays solid; only the outline gets the crayon look */}
                <path className="cc-ac-fill" d="M21 3 L37 8.5 V21 C37 31 29.5 37.5 21 41 C12.5 37.5 5 31 5 21 V8.5 Z" />
                <path className="cc-ac-shield" d="M21 3 L37 8.5 V21 C37 31 29.5 37.5 21 41 C12.5 37.5 5 31 5 21 V8.5 Z" strokeWidth="3" strokeLinejoin="round" />
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
                  <img src={art('gold-icon')} alt="" width={22} height={22} />
                  <p>{c.gold}</p>
                </button>
              ) : (
                <div className="cc-gold" title="金币">
                  <img src={art('gold-icon')} alt="" width={22} height={22} />
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
                  const fromBottom = HEART_COUNT - 1 - i; // fill from the bottom up: real HP, then striped temp HP
                  const left = unitKind(fromBottom * 2 + 1), right = unitKind(fromBottom * 2 + 2);
                  return (
                    <li key={i} className="cc-heart">
                      <img src={heartArt[right]} alt="" />
                      {left !== right && <img className="cc-heart-half" src={heartArt[left]} alt="" />}
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
          </div>

          <div className="cc-slots">
            {slots.map((a, i) =>
              a ? (
                <div key={i} className="cc-slot cc-slot--info" {...slotProps(describeAttack(a))}>
                  <div className="cc-slot-frame" />
                  <p className="cc-slot-label">{a.name}</p>
                  <img className={`cc-slot-icon cc-slot-icon--${a.icon}`} src={cardAttackIcon(palette, a.icon)} alt="" />
                  <div className="cc-badge">
                    <img src={art('badge')} alt="" />
                    <span className={a.badge.length > 3 ? 'cc-badge-text cc-badge-text--sm' : 'cc-badge-text'}>{a.badge}</span>
                  </div>
                </div>
              ) : (
                <div key={i} className="cc-slot cc-slot--empty" aria-label="空攻击格">
                  <div className="cc-slot-frame cc-slot-frame--dashed" />
                </div>
              ),
            )}
            {/* potion slot: unlabeled in the Figma frames; 58:2109 (solid ink) when there are potions, 20:822 (grey dashed) when none */}
            {c.potions > 0 ? (
              <div className="cc-slot cc-slot--potion cc-slot--info" {...slotProps(describePotion(c.potions))}>
                <div className="cc-slot-frame" />
                <img className="cc-slot-icon" src={art('icon-potion')} alt="" />
                <PotionBadge img={art('badge')} count={c.potions} onQuickEdit={onQuickEdit} />
              </div>
            ) : (
              <div className="cc-slot cc-slot--potion cc-slot--none cc-slot--info" {...slotProps(describePotion(0))}>
                <div className="cc-slot-frame cc-slot-frame--dashed cc-slot-frame--grey" />
                <img className="cc-slot-icon" src={art('icon-no-potion')} alt="" />
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
