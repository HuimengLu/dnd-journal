import { PDFDocument, PDFTextField, PDFCheckBox, PDFDict, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import { type Attack, type AttackIcon, type CharacterInput, emptyCharacterInput } from '../shared/types.ts';

/**
 * Reads the fillable form fields of a character sheet PDF.
 * Built for the official 5e sheet (field names like CharacterName, ClassLevel, HPMax),
 * which is what the group uses; other layouts fall back to manual entry.
 */
export async function extractCharacterFields(bytes: Uint8Array): Promise<{ fields: CharacterInput; missing: string[] }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
  const raw = new Map<string, string>();
  try {
    for (const field of doc.getForm().getFields()) {
      const name = field.getName().trim();
      if (field instanceof PDFTextField) raw.set(name, (field.getText() ?? '').trim());
      else if (field instanceof PDFCheckBox) raw.set(name, field.isChecked() ? 'yes' : '');
    }
  } catch {
    // broken AcroForm index — the widget scan below still finds the values
  }
  // Many exported sheets have an incomplete /Fields index, so also read every widget on every page.
  for (const [name, value] of readWidgetValues(doc)) {
    if (!raw.get(name)) raw.set(name, value);
  }
  if (raw.size === 0) throw new Error('NO_FORM_FIELDS');

  const get = (...names: string[]) => {
    for (const n of names) {
      const v = raw.get(n);
      if (v) return v;
    }
    return '';
  };
  const missing: string[] = [];
  const out = emptyCharacterInput();

  out.name = get('CharacterName', 'CharacterName 2');
  if (!out.name) missing.push('name');

  const classLevel = get('ClassLevel');
  const lvl = parseLevel(classLevel);
  if (lvl !== null) out.level = lvl;
  else missing.push('level');
  out.className = classLevel
    .replace(/\b(lv|lvl|level)\.?\s*\d+/gi, '')
    .replace(/(等级\s*)?\d+\s*级?/g, '')
    .replace(/\s*[-–—]\s*/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s·]+|[\s·]+$/g, '')
    .trim();
  if (!out.className) missing.push('className');

  const num = (key: string, target: keyof CharacterInput, ...names: string[]) => {
    const n = parseNumber(get(...names));
    if (n === null) missing.push(key);
    else (out as unknown as Record<string, number>)[target] = n;
    return n;
  };
  const hpMax = num('hpMax', 'hpMax', 'HPMax');
  const hpCur = parseNumber(get('HPCurrent'));
  out.hpCurrent = hpCur ?? hpMax ?? out.hpCurrent;
  if (hpMax !== null && out.hpCurrent > hpMax) out.hpCurrent = hpMax;
  out.hpTemp = parseNumber(get('HPTemp')) ?? 0;
  num('ac', 'ac', 'AC');
  num('speed', 'speed', 'Speed');
  out.gold = parseNumber(get('GP')) ?? 0;

  const abilityKeys = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' } as const;
  for (const [k, f] of Object.entries(abilityKeys)) {
    const n = parseNumber(get(f));
    if (n === null) missing.push(k);
    else out.abilities[k as keyof typeof abilityKeys] = n;
  }

  const attacks: Attack[] = [];
  const weaponRows: [string, string, string][] = [
    ['Wpn Name', 'Wpn1 AtkBonus', 'Wpn1 Damage'],
    ['Wpn Name 2', 'Wpn2 AtkBonus', 'Wpn2 Damage'],
    ['Wpn Name 3', 'Wpn3 AtkBonus', 'Wpn3 Damage'],
  ];
  for (const [nameKey, bonusKey, damageKey] of weaponRows) {
    const name = get(nameKey);
    if (!name) continue;
    const badge = get(bonusKey).replace(/\s+/g, '') || '—';
    const damage = get(damageKey).replace(/\s+/g, ' ').trim();
    attacks.push({
      name: shortName(name), badge, icon: guessIcon(name),
      ...(damage ? { summary: `命中 ${badge}，伤害 ${damage}`.slice(0, 40) } : {}),
    });
  }
  out.attacks = attacks.slice(0, 3);

  return { fields: out, missing };
}

function readWidgetValues(doc: PDFDocument): Map<string, string> {
  const out = new Map<string, string>();
  const text = (o: unknown) =>
    o instanceof PDFString || o instanceof PDFHexString ? o.decodeText().trim() : o instanceof PDFName ? o.decodeText() : '';
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookupMaybe(i, PDFDict);
      if (!annot) continue;
      // name and value may live on the widget or on its parent field
      let holder: PDFDict | undefined = annot;
      let name = text(annot.lookup(PDFName.of('T')));
      let value = annot.lookup(PDFName.of('V'));
      const parent = annot.lookupMaybe(PDFName.of('Parent'), PDFDict);
      if (!name && parent) { name = text(parent.lookup(PDFName.of('T'))); holder = parent; }
      if (value === undefined && holder) value = holder.lookup(PDFName.of('V'));
      const v = text(value);
      if (name && v && v !== 'Off') out.set(name.trim(), v);
    }
  }
  return out;
}

function parseLevel(s: string): number | null {
  const m = s.match(/(\d+)\s*$/) ?? s.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 20 ? n : null;
}

/** "18" → 18, "11+2" → 13, "30 ft" → 30. */
function parseNumber(s: string): number | null {
  const t = s.replace(/[^\d+\-]/g, '');
  if (!t) return null;
  if (/^\d+(\+\d+)*$/.test(t)) return t.split('+').reduce((a, b) => a + Number(b), 0);
  const m = t.match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

/** Keep the English part of bilingual names like "刺剑 Rapier" when present. */
function shortName(s: string): string {
  const en = s.match(/[A-Za-z][A-Za-z' -]*/);
  return (en ? en[0] : s).trim().slice(0, 14);
}

function guessIcon(name: string): AttackIcon {
  const n = name.toLowerCase();
  if (/dagger|knife|匕首|短刀/.test(n)) return 'dagger';
  if (/bow|crossbow|弓|弩/.test(n)) return 'bow';
  if (/axe|hatchet|斧/.test(n)) return 'axe';
  if (/sword|rapier|blade|scimitar|剑|刀/.test(n)) return 'sword';
  if (/fist|unarmed|punch|拳|徒手/.test(n)) return 'fist';
  if (/fire|flame|bolt|火|焰/.test(n)) return 'flame';
  if (/mock|嘲/.test(n)) return 'mockery';
  if (/whisper|song|lute|琴|歌|低语/.test(n)) return 'whispers';
  return 'sparkle';
}
