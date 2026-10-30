import type { AttackIcon } from '../../shared/types.ts';
import dagger from './assets/figma/icon-dagger.svg';
import mockery from './assets/figma/icon-mockery.svg';
import whispers from './assets/figma/icon-whispers.svg';
import sword from './assets/icons/icon-sword.svg';
import axe from './assets/icons/icon-axe.svg';
import bow from './assets/icons/icon-bow.svg';
import flame from './assets/icons/icon-flame.svg';
import fist from './assets/icons/icon-fist.svg';
import sparkle from './assets/icons/icon-sparkle.svg';

const ICONS: Record<AttackIcon, string> = { dagger, sword, axe, bow, flame, fist, mockery, whispers, sparkle };

export const ICON_LABELS: Record<AttackIcon, string> = {
  dagger: '匕首',
  sword: '刀剑',
  axe: '斧头',
  bow: '弓弩',
  flame: '火焰法术',
  fist: '徒手',
  mockery: '嘲讽',
  whispers: '音律',
  sparkle: '魔法',
};

export const attackIcon = (icon: AttackIcon) => ICONS[icon] ?? sparkle;

/** Character card art, one folder per palette: card = Figma 64:2467 ink, card-sketch = the grey ink-map palette. */
export type CardPalette = 'figma' | 'sketch';
const CARD_ART_FILES: Record<CardPalette, Record<string, string>> = {
  figma: import.meta.glob('./assets/card/*.svg', { eager: true, import: 'default' }),
  sketch: import.meta.glob('./assets/card-sketch/*.svg', { eager: true, import: 'default' }),
};
const DIR: Record<CardPalette, string> = { figma: './assets/card/', sketch: './assets/card-sketch/' };

/** A card image by file name (without .svg), e.g. cardArt('sketch', 'heart-filled'). */
export const cardArt = (palette: CardPalette, name: string) => CARD_ART_FILES[palette][`${DIR[palette]}${name}.svg`];
export const cardAttackIcon = (palette: CardPalette, icon: AttackIcon) => cardArt(palette, `icon-${icon}`) ?? cardArt(palette, 'icon-sparkle');
