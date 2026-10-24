import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { ATTACK_ICONS, type AttackIcon, type CharacterInput, emptyCharacterInput } from '../shared/types.ts';

/**
 * Reads character sheets that have no form fields (scans, exported images, artifact printouts)
 * by asking Claude to read the page. Only active when ANTHROPIC_API_KEY is set on the server.
 */
export const aiAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY);

const num = z.number().int().nullable();
const SheetSchema = z.object({
  name: z.string().nullable(),
  level: num,
  className: z.string().nullable().describe('职业（可带子职），用中文，例如 "吟游诗人 · 雄辩学院"'),
  hpMax: num,
  hpCurrent: num.describe('当前生命值；表上没写就填 null'),
  ac: num,
  speed: num.describe('速度，单位尺/英尺（ft）'),
  abilities: z.object({ str: num, dex: num, con: num, int: num, wis: num, cha: num }).describe('六项属性的原始值（不是调整值）'),
  gold: num.describe('金币 GP 数量'),
  potions: num.describe('治疗药水数量'),
  attacks: z
    .array(
      z.object({
        name: z.string().describe('攻击或常用攻击法术的中文名'),
        badge: z.string().describe('命中加值如 "+5"，或豁免 DC 如 "DC14"'),
        icon: z.string().describe(`只能是 ${ATTACK_ICONS.join(' / ')} 之一。` + 'dagger 匕首/短剑, sword 长剑/刺剑, axe 斧, bow 弓弩/远程, flame 火焰伤害法术, fist 徒手, mockery 嘲讽/心灵伤害, whispers 音波/心灵法术, sparkle 其他魔法'),
        summary: z.string().describe('一行概括：伤害骰与伤害类型，例如 "1d8+3 穿刺"'),
        details: z.string().describe('一到两句说明射程、特性或效果'),
      }),
    )
    .describe('最多 4 个最常用的攻击或攻击戏法'),
});

const PROMPT = `这是一张 D&D 5e（2024 规则）角色卡。请把角色信息读出来填进结构里。
只填卡上真正写着的内容；看不清或没写的字段填 null，不要猜。
属性填原始值（例如 16），不是调整值（+3）。`;

export async function extractWithClaude(bytes: Uint8Array, mime: string): Promise<{ fields: CharacterInput; missing: string[] }> {
  const client = new Anthropic();
  const data = Buffer.from(bytes).toString('base64');
  const file =
    mime === 'application/pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: mime as 'image/png' | 'image/jpeg' | 'image/webp', data } } as const);

  const response = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    output_config: { effort: 'low', format: zodOutputFormat(SheetSchema) },
    messages: [{ role: 'user', content: [file, { type: 'text', text: PROMPT }] }],
  });
  const s = response.parsed_output;
  if (!s) throw new Error('AI_NO_OUTPUT');

  const out = emptyCharacterInput();
  const missing: string[] = [];
  const take = <K extends keyof CharacterInput>(key: K, v: CharacterInput[K] | null) => {
    if (v === null || v === '') missing.push(key);
    else out[key] = v;
  };
  take('name', s.name?.trim() ?? null);
  take('level', s.level);
  take('className', s.className?.trim() ?? null);
  take('hpMax', s.hpMax);
  take('ac', s.ac);
  take('speed', s.speed);
  out.hpCurrent = s.hpCurrent ?? out.hpMax;
  out.gold = s.gold ?? 0;
  out.potions = s.potions ?? 0;
  for (const a of Object.keys(out.abilities) as (keyof typeof out.abilities)[]) {
    const v = s.abilities[a];
    if (v === null) missing.push(a);
    else out.abilities[a] = v;
  }
  // the SDK can't enforce enums in the output schema, so unknown icons fall back to sparkle
  out.attacks = s.attacks.slice(0, 4).map((a) => ({
    ...a,
    icon: (ATTACK_ICONS as readonly string[]).includes(a.icon) ? (a.icon as AttackIcon) : 'sparkle',
  }));
  return { fields: out, missing };
}

/** Turns an API failure into a message the DM can act on (shown in the import dialog). */
export function describeAiError(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    const msg = e.message ?? '';
    if (e.status === 401) return 'API key 无效，请检查 Render 里 ANTHROPIC_API_KEY 的值有没有复制完整';
    if (e.status === 403) return '这个 API key 没有权限使用模型，请在 console.anthropic.com 检查账户';
    if (/credit balance/i.test(msg)) return 'Anthropic 账户余额不足，请先在 console.anthropic.com 的 Billing 里充值';
    if (e.status === 429) return 'AI 请求太频繁或额度已用完，稍后再试';
    if (e.status && e.status >= 500) return 'Anthropic 服务暂时繁忙，过一会儿再试';
    return `AI 读取失败（${e.status ?? '网络错误'}）：${msg.slice(0, 160)}`;
  }
  return `AI 读取失败：${e instanceof Error ? e.message.slice(0, 160) : '未知错误'}`;
}
