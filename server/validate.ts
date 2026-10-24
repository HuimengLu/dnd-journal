import { ABILITIES, ATTACK_ICONS, CONDITION_IDS, type Attack, type CharacterInput, type ConditionId } from '../shared/types.ts';

export class ValidationError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

function int(v: unknown, field: string, label: string, min: number, max: number): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) throw new ValidationError(`${label}必须是整数`, field);
  if (n < min || n > max) throw new ValidationError(`${label}要在 ${min}–${max} 之间`, field);
  return n;
}

function str(v: unknown, field: string, label: string, max: number, required = false): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw new ValidationError(`请填写${label}`, field);
  if (s.length > max) throw new ValidationError(`${label}最多 ${max} 个字`, field);
  return s;
}

/** Validates a full character (create, or DM edit merged over the stored one). */
export function validateCharacter(body: Record<string, unknown>, assetExists: (id: string) => boolean): CharacterInput {
  const hpMax = int(body.hpMax, 'hpMax', '最大生命值', 1, 999);
  const hpCurrent = int(body.hpCurrent, 'hpCurrent', '当前生命值', 0, 999);
  if (hpCurrent > hpMax) throw new ValidationError('当前生命值不能超过最大生命值', 'hpCurrent');

  const abilitiesIn = (body.abilities ?? {}) as Record<string, unknown>;
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, int(abilitiesIn[a], `abilities.${a}`, a.toUpperCase(), 1, 30)])) as CharacterInput['abilities'];

  const conditionsIn = Array.isArray(body.conditions) ? body.conditions : [];
  const conditions = [...new Set(conditionsIn.map(String))];
  for (const c of conditions) if (!CONDITION_IDS.includes(c)) throw new ValidationError(`未知状态：${c}`, 'conditions');

  const attacksIn = Array.isArray(body.attacks) ? body.attacks : [];
  if (attacksIn.length > 3) throw new ValidationError('角色卡最多放 3 种攻击方式', 'attacks');
  const attacks: Attack[] = attacksIn.map((a, i) => {
    const o = (a ?? {}) as Record<string, unknown>;
    const icon = String(o.icon ?? 'sparkle');
    if (!(ATTACK_ICONS as readonly string[]).includes(icon)) throw new ValidationError(`第 ${i + 1} 个攻击的图标无效`, 'attacks');
    const summary = str(o.summary, 'attacks', `第 ${i + 1} 个攻击的简介`, 40);
    const details = str(o.details, 'attacks', `第 ${i + 1} 个攻击的详细说明`, 300);
    return {
      name: str(o.name, 'attacks', `第 ${i + 1} 个攻击的名称`, 16, true), badge: str(o.badge, 'attacks', '命中/DC', 6) || '—', icon: icon as Attack['icon'],
      ...(summary ? { summary } : {}), ...(details ? { details } : {}),
    };
  });

  const assetRef = (v: unknown, field: string) => {
    if (v === null || v === undefined || v === '') return null;
    const id = String(v);
    if (!assetExists(id)) throw new ValidationError('引用的文件不存在', field);
    return id;
  };

  return {
    name: str(body.name, 'name', '角色姓名', 60, true),
    level: int(body.level, 'level', '等级', 1, 20),
    className: str(body.className, 'className', '职业', 40),
    portraitAssetId: assetRef(body.portraitAssetId, 'portraitAssetId'),
    hpCurrent,
    hpMax,
    hpTemp: int(body.hpTemp ?? 0, 'hpTemp', '临时生命值', 0, 999),
    ac: int(body.ac, 'ac', 'AC', 0, 40),
    speed: int(body.speed, 'speed', '速度', 0, 200),
    abilities,
    conditions: conditions as ConditionId[],
    gold: int(body.gold ?? 0, 'gold', '金币', 0, 9_999_999),
    attacks,
    potions: int(body.potions ?? 0, 'potions', '药水数量', 0, 99),
    pdfAssetId: assetRef(body.pdfAssetId, 'pdfAssetId'),
    sheetPageAssetIds: (Array.isArray(body.sheetPageAssetIds) ? body.sheetPageAssetIds : []).map(String).filter(assetExists).slice(0, 6),
  };
}
