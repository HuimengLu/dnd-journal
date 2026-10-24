// Dice expressions like "1d20+5", "2d6+1d4-1", "d100". Parsed the same way on both sides;
// the server does the actual rolling.

export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

export interface DiceTerm {
  count: number;
  sides: number;
  /** -1 when the term is subtracted ("1d20-1d4"). */
  sign: 1 | -1;
}

export interface ParsedExpression {
  terms: DiceTerm[];
  modifier: number;
  /** Normalised text, e.g. "2d6+3". */
  text: string;
}

export interface DiceRoll {
  id: string;
  roller: string;
  role: 'dm' | 'player';
  expression: string;
  terms: (DiceTerm & { results: number[] })[];
  modifier: number;
  total: number;
  createdAt: string;
}

export function parseExpression(input: string): ParsedExpression | { error: string } {
  const src = input.replace(/\s+/g, '').toLowerCase();
  if (!src) return { error: '请输入要掷的骰子，例如 1d20+5' };
  if (src.length > 40) return { error: '表达式太长了' };
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(src)) return { error: '格式不对，试试 1d20+5 或 2d6+1d4' };
  const terms: DiceTerm[] = [];
  let modifier = 0, dice = 0;
  for (const m of src.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const sign = m[1] === '-' ? -1 : 1;
    const part = m[2];
    if (part.includes('d')) {
      const [c, s] = part.split('d');
      const count = c === '' ? 1 : Number(c), sides = Number(s);
      if (!(DICE_SIDES as readonly number[]).includes(sides)) return { error: `没有 d${sides}，可用：${DICE_SIDES.map((d) => 'd' + d).join(' ')}` };
      if (count < 1) return { error: '骰子数量至少是 1' };
      dice += count;
      terms.push({ count, sides, sign });
    } else {
      modifier += sign * Number(part);
    }
  }
  if (terms.length === 0) return { error: '至少要掷一个骰子' };
  if (dice > 50) return { error: '一次最多掷 50 个骰子' };
  if (Math.abs(modifier) > 999) return { error: '加值太大了' };
  const text = terms.map((t, i) => `${t.sign < 0 ? '-' : i ? '+' : ''}${t.count}d${t.sides}`).join('') + (modifier ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : '');
  return { terms, modifier, text };
}
