import type { AttackIcon } from '../../shared/types.ts';
import dagger from './assets/figma/icon-dagger.svg';
import mockery from './assets/figma/icon-mockery.svg';
import whispers from './assets/figma/icon-whispers.svg';
import sword from './assets/icons/icon-sword.svg';
import bow from './assets/icons/icon-bow.svg';
import flame from './assets/icons/icon-flame.svg';
import fist from './assets/icons/icon-fist.svg';
import sparkle from './assets/icons/icon-sparkle.svg';

const ICONS: Record<AttackIcon, string> = { dagger, sword, bow, flame, fist, mockery, whispers, sparkle };

export const ICON_LABELS: Record<AttackIcon, string> = {
  dagger: '匕首',
  sword: '刀剑',
  bow: '弓弩',
  flame: '火焰法术',
  fist: '徒手',
  mockery: '嘲讽',
  whispers: '音律',
  sparkle: '魔法',
};

export const attackIcon = (icon: AttackIcon) => ICONS[icon] ?? sparkle;
