import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Asset, Character, CharacterInput, DiceRoll, JournalObject, JournalPage, OverviewPosition } from '../shared/types.ts';

export const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'campaign.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS campaign (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY, title TEXT NOT NULL, sort_order INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS objects (
    id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL, ref TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
    z INTEGER NOT NULL, rotation REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS overview_positions (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    x REAL NOT NULL, y REAL NOT NULL, z INTEGER NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS rolls (
    id TEXT PRIMARY KEY, roller TEXT NOT NULL, role TEXT NOT NULL, expression TEXT NOT NULL,
    terms TEXT NOT NULL, modifier INTEGER NOT NULL, total INTEGER NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY, stored_name TEXT NOT NULL, original_name TEXT NOT NULL, mime TEXT NOT NULL,
    size INTEGER NOT NULL, width INTEGER, height INTEGER, created_at TEXT NOT NULL);
`);

// pages.kind: 'journal' for tabs the DM manages, 'overview' for the hidden page behind the character overview
if (!(db.prepare('PRAGMA table_info(pages)').all() as { name: string }[]).some((c) => c.name === 'kind')) {
  db.exec("ALTER TABLE pages ADD COLUMN kind TEXT NOT NULL DEFAULT 'journal'");
}

const now = () => new Date().toISOString();

// ---------- campaign (exactly one) ----------
export function getCampaign(): { id: string; name: string } {
  let row = db.prepare('SELECT id, name FROM campaign LIMIT 1').get() as { id: string; name: string } | undefined;
  if (!row) {
    row = { id: randomUUID(), name: process.env.CAMPAIGN_NAME ?? 'Campaign Journal' };
    db.prepare('INSERT INTO campaign (id, name, created_at) VALUES (?, ?, ?)').run(row.id, row.name, now());
    // the default scene page every campaign starts with
    createPage('当前场景');
  }
  return row;
}

export function overviewPageId(): string {
  const r = db.prepare("SELECT id FROM pages WHERE kind = 'overview' LIMIT 1").get() as { id: string } | undefined;
  if (r) return r.id;
  const id = randomUUID(), t = now();
  db.prepare("INSERT INTO pages (id, title, sort_order, kind, created_at, updated_at) VALUES (?, '角色总览', -1, 'overview', ?, ?)").run(id, t, t);
  return id;
}

// ---------- characters ----------
type CharRow = { id: string; data: string; created_at: string; updated_at: string };
const toCharacter = (r: CharRow): Character => {
  const data = JSON.parse(r.data) as Partial<CharacterInput>;
  // rows saved before sheet images existed have no sheetPageAssetIds
  return { ...(data as CharacterInput), sheetPageAssetIds: data.sheetPageAssetIds ?? [], id: r.id, createdAt: r.created_at, updatedAt: r.updated_at };
};

export function listCharacters(): Character[] {
  return (db.prepare('SELECT * FROM characters ORDER BY created_at').all() as CharRow[]).map(toCharacter);
}
export function getCharacter(id: string): Character | null {
  const r = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as CharRow | undefined;
  return r ? toCharacter(r) : null;
}
export function insertCharacter(input: CharacterInput): Character {
  const id = randomUUID(), t = now();
  db.prepare('INSERT INTO characters (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, JSON.stringify(input), t, t);
  return getCharacter(id)!;
}
export function updateCharacter(id: string, input: CharacterInput): Character {
  db.prepare('UPDATE characters SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(input), now(), id);
  return getCharacter(id)!;
}
export function deleteCharacter(id: string) {
  db.prepare("DELETE FROM objects WHERE type = 'character' AND ref = ?").run(id);
  db.prepare('DELETE FROM overview_positions WHERE character_id = ?').run(id);
  db.prepare('DELETE FROM characters WHERE id = ?').run(id);
}
export function findCharacterByName(name: string): Character | null {
  const n = name.trim().toLowerCase();
  return listCharacters().find((c) => c.name.trim().toLowerCase() === n) ?? null;
}

// ---------- pages ----------
type PageRow = { id: string; title: string; sort_order: number; created_at: string; updated_at: string };
const toPage = (r: PageRow): JournalPage => ({ id: r.id, title: r.title, sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at });

export function listPages(): JournalPage[] {
  return (db.prepare("SELECT * FROM pages WHERE kind = 'journal' ORDER BY sort_order, created_at").all() as PageRow[]).map(toPage);
}
export function getPage(id: string): JournalPage | null {
  const r = db.prepare('SELECT * FROM pages WHERE id = ?').get(id) as PageRow | undefined;
  return r ? toPage(r) : null;
}
export function createPage(title: string): JournalPage {
  const id = randomUUID(), t = now();
  const max = (db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM pages WHERE kind = 'journal'").get() as { m: number }).m;
  db.prepare('INSERT INTO pages (id, title, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, title, max + 1, t, t);
  return getPage(id)!;
}
export function renamePage(id: string, title: string) {
  db.prepare('UPDATE pages SET title = ?, updated_at = ? WHERE id = ?').run(title, now(), id);
}
export function reorderPages(ids: string[]) {
  const stmt = db.prepare('UPDATE pages SET sort_order = ?, updated_at = ? WHERE id = ?');
  const t = now();
  ids.forEach((id, i) => stmt.run(i, t, id));
}
export function deletePage(id: string): string[] {
  const imageRefs = (db.prepare("SELECT ref FROM objects WHERE page_id = ? AND type = 'image'").all(id) as { ref: string }[]).map((r) => r.ref);
  db.prepare('DELETE FROM pages WHERE id = ?').run(id);
  return imageRefs;
}

// ---------- journal objects ----------
type ObjRow = { id: string; page_id: string; type: string; ref: string; x: number; y: number; w: number; h: number; z: number; rotation: number; created_at: string; updated_at: string };
const toObject = (r: ObjRow): JournalObject => ({
  id: r.id, pageId: r.page_id, type: r.type as JournalObject['type'], ref: r.ref,
  x: r.x, y: r.y, w: r.w, h: r.h, z: r.z, rotation: r.rotation, createdAt: r.created_at, updatedAt: r.updated_at,
});

export function listObjects(): JournalObject[] {
  return (db.prepare('SELECT * FROM objects ORDER BY z').all() as ObjRow[]).map(toObject);
}
export function getObject(id: string): JournalObject | null {
  const r = db.prepare('SELECT * FROM objects WHERE id = ?').get(id) as ObjRow | undefined;
  return r ? toObject(r) : null;
}
export function createObject(o: Pick<JournalObject, 'pageId' | 'type' | 'ref' | 'x' | 'y' | 'w' | 'h' | 'rotation'>): JournalObject {
  const id = randomUUID(), t = now();
  const z = (db.prepare('SELECT COALESCE(MAX(z), 0) AS m FROM objects WHERE page_id = ?').get(o.pageId) as { m: number }).m + 1;
  db.prepare('INSERT INTO objects (id, page_id, type, ref, x, y, w, h, z, rotation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, o.pageId, o.type, o.ref, o.x, o.y, o.w, o.h, z, o.rotation, t, t);
  return getObject(id)!;
}
export function updateObject(id: string, p: Partial<Pick<JournalObject, 'x' | 'y' | 'w' | 'h' | 'rotation'>> & { layer?: 'front' | 'back' }) {
  const cur = getObject(id);
  if (!cur) return null;
  let z = cur.z;
  if (p.layer) {
    const agg = p.layer === 'front' ? 'MAX' : 'MIN';
    const edge = (db.prepare(`SELECT ${agg}(z) AS v FROM objects WHERE page_id = ?`).get(cur.pageId) as { v: number }).v;
    z = p.layer === 'front' ? edge + 1 : edge - 1;
  }
  db.prepare('UPDATE objects SET x = ?, y = ?, w = ?, h = ?, rotation = ?, z = ?, updated_at = ? WHERE id = ?')
    .run(p.x ?? cur.x, p.y ?? cur.y, p.w ?? cur.w, p.h ?? cur.h, p.rotation ?? cur.rotation, z, now(), id);
  return getObject(id);
}
export function deleteObject(id: string): JournalObject | null {
  const cur = getObject(id);
  if (cur) db.prepare('DELETE FROM objects WHERE id = ?').run(id);
  return cur;
}
export function countImageRefs(assetId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM objects WHERE type = 'image' AND ref = ?").get(assetId) as { n: number }).n;
}

// ---------- overview layout (kept apart from character stats) ----------
export function listOverview(): OverviewPosition[] {
  return (db.prepare('SELECT character_id AS characterId, x, y, z FROM overview_positions ORDER BY z').all() as unknown) as OverviewPosition[];
}
export function setOverviewPosition(characterId: string, x: number, y: number): OverviewPosition {
  const z = (db.prepare('SELECT COALESCE(MAX(z), 0) AS m FROM overview_positions').get() as { m: number }).m + 1;
  db.prepare(`INSERT INTO overview_positions (character_id, x, y, z, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(character_id) DO UPDATE SET x = excluded.x, y = excluded.y, z = excluded.z, updated_at = excluded.updated_at`)
    .run(characterId, x, y, z, now());
  return { characterId, x, y, z };
}

// ---------- dice rolls (shared history, newest first) ----------
type RollRow = { id: string; roller: string; role: string; expression: string; terms: string; modifier: number; total: number; created_at: string };
const toRoll = (r: RollRow): DiceRoll => ({ id: r.id, roller: r.roller, role: r.role as DiceRoll['role'], expression: r.expression, terms: JSON.parse(r.terms), modifier: r.modifier, total: r.total, createdAt: r.created_at });

export function listRolls(limit = 20): DiceRoll[] {
  return (db.prepare('SELECT * FROM rolls ORDER BY created_at DESC LIMIT ?').all(limit) as RollRow[]).map(toRoll);
}
export function insertRoll(r: Omit<DiceRoll, 'id' | 'createdAt'>): DiceRoll {
  const id = randomUUID(), t = now();
  db.prepare('INSERT INTO rolls (id, roller, role, expression, terms, modifier, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, r.roller, r.role, r.expression, JSON.stringify(r.terms), r.modifier, r.total, t);
  // keep the table small: the newest 200 rolls are plenty for a session log
  db.prepare('DELETE FROM rolls WHERE id NOT IN (SELECT id FROM rolls ORDER BY created_at DESC LIMIT 200)').run();
  return toRoll(db.prepare('SELECT * FROM rolls WHERE id = ?').get(id) as RollRow);
}

// ---------- assets ----------
type AssetRow = { id: string; stored_name: string; original_name: string; mime: string; size: number; width: number | null; height: number | null; created_at: string };
const toAsset = (r: AssetRow): Asset => ({ id: r.id, originalName: r.original_name, mime: r.mime, size: r.size, width: r.width, height: r.height, createdAt: r.created_at });

export function listAssets(): Asset[] {
  return (db.prepare('SELECT * FROM assets ORDER BY created_at').all() as AssetRow[]).map(toAsset);
}
export function getAssetRow(id: string): AssetRow | null {
  return (db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined) ?? null;
}
export function insertAsset(a: { storedName: string; originalName: string; mime: string; size: number; width: number | null; height: number | null }): Asset {
  const id = randomUUID();
  db.prepare('INSERT INTO assets (id, stored_name, original_name, mime, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, a.storedName, a.originalName, a.mime, a.size, a.width, a.height, now());
  return toAsset(getAssetRow(id)!);
}
export function deleteAssetRow(id: string): AssetRow | null {
  const r = getAssetRow(id);
  if (r) db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  return r;
}
