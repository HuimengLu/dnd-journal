// Types and rules shared by the server and the web client.
import type { DiceRoll } from './dice.ts';
export type { DiceRoll } from './dice.ts';

export type Role = 'dm' | 'player';

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];
export type AbilityScores = Record<Ability, number>;

export const ATTACK_ICONS = ['dagger', 'sword', 'axe', 'bow', 'flame', 'fist', 'mockery', 'whispers', 'sparkle'] as const;
export type AttackIcon = (typeof ATTACK_ICONS)[number];

export interface Attack {
  name: string;
  /** Short badge text: to-hit bonus ("+4") or save DC ("DC14"). */
  badge: string;
  icon: AttackIcon;
  /** One line shown on hover. Optional; a default is derived from the badge. */
  summary?: string;
  /** A few sentences shown in the paper note on click. Optional. */
  details?: string;
}

export interface SlotInfo {
  title: string;
  badge: string;
  summary: string;
  details: string;
}

/** Hover/click text for an attack slot, falling back to wording derived from the badge. */
export function describeAttack(a: Attack): SlotInfo {
  const dc = a.badge.match(/^DC\s*(\d+)/i);
  const bonus = a.badge.match(/^[+-]\d+$/);
  const summary = a.summary?.trim() || (dc ? `目标进行豁免，DC ${dc[1]}` : bonus ? `攻击检定 ${a.badge}` : '攻击方式');
  const details = a.details?.trim() || (dc
    ? `目标需要进行豁免检定，结果低于 ${dc[1]} 就会受到这个效果。具体效果和伤害可以让 DM 在角色信息里补充说明。`
    : bonus
      ? `掷一个 d20，加上 ${a.badge}，结果达到目标的护甲等级（AC）就算命中。伤害可以让 DM 在角色信息里补充说明。`
      : '还没有写说明。DM 可以在“编辑角色信息”里为这个攻击方式补充简介和详细说明。');
  return { title: a.name, badge: a.badge, summary, details };
}

export function describePotion(count: number): SlotInfo {
  return count > 0
    ? { title: '治疗药水', badge: `×${count}`, summary: `治疗药水，还剩 ${count} 瓶`,
        details: `一瓶治疗药水，喝下恢复 2d4+2 生命值。2024 规则下可以用附赠动作饮用；喂给别人需要用动作。现在还剩 ${count} 瓶。` }
    : { title: '没有药水', badge: '×0', summary: '身上没有药水',
        details: '这个角色身上没有药水。拿到药水后，DM 可以单击药水格下方的圆章修改数量。' };
}

/** The 5e conditions, plus exhaustion. Stored as ids, never free text. */
export const CONDITIONS = [
  { id: 'blinded', label: '目盲', en: 'Blinded', glyph: '◉' },
  { id: 'charmed', label: '魅惑', en: 'Charmed', glyph: '♥' },
  { id: 'deafened', label: '耳聋', en: 'Deafened', glyph: '◌' },
  { id: 'frightened', label: '恐慌', en: 'Frightened', glyph: '!' },
  { id: 'grappled', label: '擒抱', en: 'Grappled', glyph: '✊' },
  { id: 'incapacitated', label: '失能', en: 'Incapacitated', glyph: '✕' },
  { id: 'invisible', label: '隐形', en: 'Invisible', glyph: '◇' },
  { id: 'paralyzed', label: '麻痹', en: 'Paralyzed', glyph: 'ϟ' },
  { id: 'petrified', label: '石化', en: 'Petrified', glyph: '▲' },
  { id: 'poisoned', label: '中毒', en: 'Poisoned', glyph: '☠' },
  { id: 'prone', label: '倒地', en: 'Prone', glyph: '⌄' },
  { id: 'restrained', label: '束缚', en: 'Restrained', glyph: '⛓' },
  { id: 'stunned', label: '震慑', en: 'Stunned', glyph: '✱' },
  { id: 'unconscious', label: '昏迷', en: 'Unconscious', glyph: 'z' },
  { id: 'exhaustion', label: '力竭', en: 'Exhaustion', glyph: '~' },
] as const;
export type ConditionId = (typeof CONDITIONS)[number]['id'];
export const CONDITION_IDS = CONDITIONS.map((c) => c.id) as readonly string[];

export interface Character {
  id: string;
  name: string;
  level: number;
  className: string;
  portraitAssetId: string | null;
  hpCurrent: number;
  hpMax: number;
  hpTemp: number;
  ac: number;
  speed: number;
  abilities: AbilityScores;
  conditions: ConditionId[];
  gold: number;
  attacks: Attack[];
  potions: number;
  pdfAssetId: string | null;
  /** The original sheet rendered to images, one per page (server-generated from the PDF). */
  sheetPageAssetIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Fields a client may send when creating or editing a character. */
export type CharacterInput = Omit<Character, 'id' | 'createdAt' | 'updatedAt'>;

export interface JournalPage {
  id: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type JournalObjectType = 'image' | 'character' | 'sticker';

export interface JournalObject {
  id: string;
  pageId: string;
  type: JournalObjectType;
  /** Asset id for images, character id for character cards, sticker id ("01"–"35") for stickers. */
  ref: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotation: number;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  originalName: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/** Where the DM dragged a card on the character overview; cards without one use the automatic grid. */
export interface OverviewPosition {
  characterId: string;
  x: number;
  y: number;
  z: number;
}

export interface CampaignState {
  campaign: { id: string; name: string };
  characters: Character[];
  pages: JournalPage[];
  objects: JournalObject[];
  assets: Asset[];
  overview: OverviewPosition[];
  /** Hidden page that holds stickers/images placed on the character overview. */
  overviewPageId: string;
  rolls: DiceRoll[];
}

export interface PdfImportResult {
  /** Null when the sheet was uploaded as an image. */
  pdfAssetId: string | null;
  fields: CharacterInput;
  /** Field names the parser could not fill; shown so the DM checks them. */
  missing: string[];
  sameNameCharacterId: string | null;
}

/** Hearts on the card: fixed count, filled in half-heart steps by HP ratio. */
export const HEART_COUNT = 6;

export function heartUnits(hpCurrent: number, hpMax: number): number {
  if (hpMax <= 0 || hpCurrent <= 0) return 0;
  const units = Math.round((hpCurrent / hpMax) * HEART_COUNT * 2); // half-heart units
  return Math.max(1, Math.min(HEART_COUNT * 2, units)); // never show 0 while alive
}

/**
 * Half-heart units for real HP and for real + temp HP (temp hearts are striped, stacked above the real ones).
 * When HP + temp exceeds max, the six hearts measure the combined total so both parts still fit; any temp HP
 * always shows as at least one striped half-heart.
 */
export function heartSplit(hpCurrent: number, hpMax: number, hpTemp: number): { hp: number; total: number } {
  if (hpTemp <= 0) { const hp = heartUnits(hpCurrent, hpMax); return { hp, total: hp }; }
  const scale = Math.max(hpMax, hpCurrent + hpTemp);
  const hp = Math.min(HEART_COUNT * 2 - 1, heartUnits(hpCurrent, scale));
  return { hp, total: Math.min(HEART_COUNT * 2, Math.max(hp + 1, heartUnits(hpCurrent + hpTemp, scale))) };
}

/** Low-HP state: at or below one third of max (the red-heart card). */
export function isLowHp(hpCurrent: number, hpMax: number): boolean {
  return hpMax > 0 && hpCurrent / hpMax <= 1 / 3;
}

export function emptyCharacterInput(): CharacterInput {
  return {
    name: '',
    level: 1,
    className: '',
    portraitAssetId: null,
    hpCurrent: 10,
    hpMax: 10,
    hpTemp: 0,
    ac: 10,
    speed: 30,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    conditions: [],
    gold: 0,
    attacks: [],
    potions: 0,
    pdfAssetId: null,
    sheetPageAssetIds: [],
  };
}
