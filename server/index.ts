import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { join, extname } from 'node:path';
import * as db from './db.ts';
import { extractCharacterFields } from './pdf.ts';
import { renderPdfPages } from './pdfRender.ts';
import { validateCharacter, ValidationError } from './validate.ts';
import { PLAYER_EDITABLE_FIELDS, type CampaignState, type Role } from '../shared/types.ts';
import { parseExpression } from '../shared/dice.ts';
import { randomInt } from 'node:crypto';
import stickers from '../web/src/assets/stickers/stickers.json' with { type: 'json' };

const PROD = process.env.NODE_ENV === 'production';
// In development the API sits behind Vite's proxy on its own port; PORT is only honoured in production.
const PORT = Number(process.env.API_PORT ?? (PROD ? process.env.PORT : undefined) ?? 8787);

// ---------- private links: one key for the DM, one for players ----------
const KEYS_FILE = join(db.DATA_DIR, 'keys.json');
type Keys = { dm: string; player: string };
const keys: Keys = existsSync(KEYS_FILE)
  ? JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
  : { dm: randomBytes(18).toString('base64url'), player: randomBytes(18).toString('base64url') };
if (!existsSync(KEYS_FILE)) writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function roleFor(key: unknown): Role | null {
  if (typeof key !== 'string' || !key) return null;
  if (same(key, keys.dm)) return 'dm';
  if (same(key, keys.player)) return 'player';
  return null;
}

declare global {
  namespace Express {
    interface Request { role?: Role }
  }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

const auth = (req: Request, res: Response, next: NextFunction) => {
  const role = roleFor(req.get('x-campaign-key') ?? req.query.key);
  if (!role) return res.status(401).json({ error: '链接无效或已过期，请向 DM 要新的链接' });
  req.role = role;
  next();
};
const dmOnly = (req: Request, res: Response, next: NextFunction) =>
  req.role === 'dm' ? next() : res.status(403).json({ error: '只有 DM 可以做这个操作' });

app.use('/api', auth);

// ---------- realtime: server-sent events ----------
const clients = new Set<Response>();
function broadcast(kind: string) {
  const msg = `event: change\ndata: ${JSON.stringify({ kind, at: Date.now() })}\n\n`;
  for (const c of clients) c.write(msg);
}
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: hello\ndata: {}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

// ---------- state ----------
function state(): CampaignState {
  return { campaign: db.getCampaign(), characters: db.listCharacters(), pages: db.listPages(), objects: db.listObjects(), assets: db.listAssets(), overview: db.listOverview(), overviewPageId: db.overviewPageId(), rolls: db.listRolls() };
}
app.get('/api/session', (req, res) => res.json({ role: req.role, campaign: db.getCampaign() }));
app.get('/api/state', (_req, res) => res.json(state()));
/** Lets the DM copy the player link from the app instead of the server console. */
app.get('/api/links', dmOnly, (_req, res) => res.json({ playerKey: keys.player }));

// ---------- characters ----------
const assetExists = (id: string) => db.getAssetRow(id) !== null;

app.post('/api/characters', dmOnly, (req, res) => {
  const input = validateCharacter(req.body ?? {}, assetExists);
  const c = db.insertCharacter(input);
  broadcast('characters');
  res.status(201).json(c);
});

app.patch('/api/characters/:id', (req, res) => {
  const cur = db.getCharacter(req.params.id);
  if (!cur) return res.status(404).json({ error: '找不到这个角色' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (req.role !== 'dm') {
    const extra = Object.keys(body).filter((k) => !(PLAYER_EDITABLE_FIELDS as readonly string[]).includes(k));
    if (extra.length) return res.status(403).json({ error: '玩家只能修改生命值' });
  }
  const { id: _i, createdAt: _c, updatedAt: _u, ...base } = cur;
  const input = validateCharacter({ ...base, ...body }, assetExists);
  const c = db.updateCharacter(cur.id, input);
  broadcast('characters');
  res.json(c);
});

app.delete('/api/characters/:id', dmOnly, (req, res) => {
  const c = db.getCharacter(req.params.id);
  db.deleteCharacter(req.params.id);
  if (c) [c.portraitAssetId, c.pdfAssetId, ...c.sheetPageAssetIds].filter((x): x is string => !!x).forEach(removeAssetIfUnused);
  broadcast('characters');
  res.status(204).end();
});

// ---------- uploads ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: db.UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 6)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function sniff(path: string): string | null {
  const b = readFileSync(path).subarray(0, 12);
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (b.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}
const discard = (f?: Express.Multer.File) => { if (f && existsSync(f.path)) unlinkSync(f.path); };

app.post('/api/assets', dmOnly, upload.single('file'), (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: '没有收到文件' });
  const mime = sniff(f.path);
  if (!mime || !IMAGE_TYPES.includes(mime)) {
    discard(f);
    return res.status(415).json({ error: '只支持 JPEG、PNG、WebP 图片' });
  }
  const w = Number(req.body.width) || null, h = Number(req.body.height) || null;
  const asset = db.insertAsset({ storedName: f.filename, originalName: f.originalname.slice(0, 120), mime, size: f.size, width: w, height: h });
  broadcast('assets');
  res.status(201).json(asset);
});

/** Renders a stored PDF to page images (WebP assets). Failures leave the character without images. */
async function storeSheetPages(pdfBytes: Uint8Array, originalName: string): Promise<string[]> {
  try {
    const pages = await renderPdfPages(pdfBytes);
    return pages.map((buf, i) => {
      const stored = `${randomUUID()}.webp`;
      writeFileSync(join(db.UPLOAD_DIR, stored), buf);
      return db.insertAsset({ storedName: stored, originalName: `${originalName} · 第 ${i + 1} 页`, mime: 'image/webp', size: buf.length, width: null, height: null }).id;
    });
  } catch (e) {
    console.error('sheet render failed:', e);
    return [];
  }
}

app.post('/api/import/pdf', dmOnly, upload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: '没有收到文件' });
  if (sniff(f.path) !== 'application/pdf') {
    discard(f);
    return res.status(415).json({ error: '这不是 PDF 文件' });
  }
  try {
    const bytes = new Uint8Array(readFileSync(f.path));
    const { fields, missing } = await extractCharacterFields(bytes);
    fields.sheetPageAssetIds = await storeSheetPages(bytes, f.originalname.slice(0, 80));
    const stored = `${randomUUID()}.pdf`;
    renameSync(f.path, join(db.UPLOAD_DIR, stored));
    const asset = db.insertAsset({ storedName: stored, originalName: f.originalname.slice(0, 120), mime: 'application/pdf', size: f.size, width: null, height: null });
    fields.pdfAssetId = asset.id;
    const dup = fields.name ? db.findCharacterByName(fields.name) : null;
    res.json({ pdfAssetId: asset.id, fields, missing, sameNameCharacterId: dup?.id ?? null });
  } catch (e) {
    discard(f);
    const noFields = e instanceof Error && e.message === 'NO_FORM_FIELDS';
    res.status(422).json({
      error: noFields ? '这份 PDF 没有可读取的表单字段，可以改用手动创建' : 'PDF 无法读取，可能已损坏或加密，可以改用手动创建',
    });
  }
});

app.get('/api/assets/:id', (req, res) => {
  const a = db.getAssetRow(req.params.id);
  if (!a) return res.status(404).end();
  res.set({ 'Cache-Control': 'private, max-age=86400', 'Content-Type': a.mime, 'X-Content-Type-Options': 'nosniff' });
  if (a.mime === 'application/pdf') res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.original_name)}`);
  res.sendFile(join(db.UPLOAD_DIR, a.stored_name));
});

function removeAssetIfUnused(id: string) {
  if (db.countImageRefs(id) > 0) return;
  if (db.listCharacters().some((c) => c.portraitAssetId === id || c.pdfAssetId === id || c.sheetPageAssetIds.includes(id))) return;
  const row = db.deleteAssetRow(id);
  if (row) { const p = join(db.UPLOAD_DIR, row.stored_name); if (existsSync(p)) unlinkSync(p); }
}

// ---------- journal pages ----------
const title = (v: unknown) => {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) throw new ValidationError('页面标题不能为空', 'title');
  if (t.length > 24) throw new ValidationError('页面标题最多 24 个字', 'title');
  return t;
};
app.post('/api/pages', dmOnly, (req, res) => {
  const p = db.createPage(title(req.body?.title));
  broadcast('pages');
  res.status(201).json(p);
});
app.patch('/api/pages/:id', dmOnly, (req, res) => {
  if (!db.getPage(req.params.id)) return res.status(404).json({ error: '找不到这一页' });
  db.renamePage(req.params.id, title(req.body?.title));
  broadcast('pages');
  res.json(db.getPage(req.params.id));
});
app.post('/api/pages/reorder', dmOnly, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const existing = new Set(db.listPages().map((p) => p.id));
  if (ids.length !== existing.size || ids.some((id: string) => !existing.has(id))) return res.status(400).json({ error: '页面顺序不完整' });
  db.reorderPages(ids);
  broadcast('pages');
  res.json(db.listPages());
});
app.delete('/api/pages/:id', dmOnly, (req, res) => {
  if (req.params.id === db.overviewPageId()) return res.status(400).json({ error: '角色总览不能删除' });
  const refs = db.deletePage(req.params.id);
  refs.forEach(removeAssetIfUnused);
  broadcast('pages');
  res.status(204).end();
});

// ---------- journal objects ----------
const coord = (v: unknown, field: string, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`${field} 超出范围`, field);
  return Math.round(n * 10) / 10;
};
app.post('/api/pages/:id/objects', dmOnly, (req, res) => {
  if (!db.getPage(req.params.id)) return res.status(404).json({ error: '找不到这一页' });
  const b = req.body ?? {};
  const type = b.type === 'character' ? 'character' : b.type === 'image' ? 'image' : b.type === 'sticker' ? 'sticker' : null;
  if (!type) throw new ValidationError('未知的对象类型', 'type');
  const ref = String(b.ref ?? '');
  if (type === 'image' && !db.getAssetRow(ref)) throw new ValidationError('图片不存在', 'ref');
  if (type === 'character' && !db.getCharacter(ref)) throw new ValidationError('角色不存在', 'ref');
  if (type === 'sticker' && !stickers.some((s) => s.id === ref)) throw new ValidationError('没有这张贴纸', 'ref');
  const o = db.createObject({
    pageId: req.params.id, type, ref,
    x: coord(b.x, 'x', -2000, 4000), y: coord(b.y, 'y', -2000, 4000),
    w: coord(b.w, 'w', 40, 3000), h: coord(b.h, 'h', 40, 3000), rotation: coord(b.rotation ?? 0, 'rotation', -180, 180),
  });
  broadcast('objects');
  res.status(201).json(o);
});
app.patch('/api/objects/:id', dmOnly, (req, res) => {
  const b = req.body ?? {};
  const patch: Parameters<typeof db.updateObject>[1] = {};
  if (b.x !== undefined) patch.x = coord(b.x, 'x', -2000, 4000);
  if (b.y !== undefined) patch.y = coord(b.y, 'y', -2000, 4000);
  if (b.w !== undefined) patch.w = coord(b.w, 'w', 40, 3000);
  if (b.h !== undefined) patch.h = coord(b.h, 'h', 40, 3000);
  if (b.rotation !== undefined) patch.rotation = coord(b.rotation, 'rotation', -180, 180);
  if (b.layer === 'front' || b.layer === 'back') patch.layer = b.layer;
  const o = db.updateObject(req.params.id, patch);
  if (!o) return res.status(404).json({ error: '找不到这个对象' });
  broadcast('objects');
  res.json(o);
});
app.delete('/api/objects/:id', dmOnly, (req, res) => {
  const o = db.deleteObject(req.params.id);
  if (o?.type === 'image') removeAssetIfUnused(o.ref);
  broadcast('objects');
  res.status(204).end();
});

// ---------- overview layout ----------
app.put('/api/overview/:characterId', dmOnly, (req, res) => {
  if (!db.getCharacter(req.params.characterId)) return res.status(404).json({ error: '找不到这个角色' });
  const p = db.setOverviewPosition(req.params.characterId, coord(req.body?.x, 'x', -2000, 4000), coord(req.body?.y, 'y', -2000, 4000));
  broadcast('overview');
  res.json(p);
});

// ---------- dice ----------
app.post('/api/rolls', (req, res) => {
  const parsed = parseExpression(String(req.body?.expression ?? ''));
  if ('error' in parsed) throw new ValidationError(parsed.error, 'expression');
  const roller = String(req.body?.roller ?? '').trim().slice(0, 16) || (req.role === 'dm' ? 'DM' : '玩家');
  const terms = parsed.terms.map((t) => ({ ...t, results: Array.from({ length: t.count }, () => randomInt(1, t.sides + 1)) }));
  const total = terms.reduce((sum, t) => sum + t.sign * t.results.reduce((a, b) => a + b, 0), 0) + parsed.modifier;
  const roll = db.insertRoll({ roller, role: req.role!, expression: parsed.text, terms, modifier: parsed.modifier, total });
  broadcast('rolls');
  res.status(201).json(roll);
});

// ---------- errors ----------
app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message, field: err.field });
  if (err instanceof multer.MulterError) return res.status(413).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '文件太大（上限 25 MB）' : '上传失败' });
  console.error(err);
  res.status(500).json({ error: '服务器出错了，请稍后再试' });
});

// ---------- production: serve the built web app ----------
if (PROD) {
  const dist = join(process.cwd(), 'web', 'dist');
  app.use(express.static(dist, { index: false }));
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
}

db.getCampaign();
db.overviewPageId();

/** Characters imported before sheet images existed get them generated once, in the background. */
async function backfillSheetPages() {
  for (const c of db.listCharacters()) {
    if (!c.pdfAssetId || c.sheetPageAssetIds.length) continue;
    const pdf = db.getAssetRow(c.pdfAssetId);
    const path = pdf && join(db.UPLOAD_DIR, pdf.stored_name);
    if (!path || !existsSync(path)) continue;
    const ids = await storeSheetPages(new Uint8Array(readFileSync(path)), pdf.original_name);
    if (!ids.length) continue;
    const { id: _i, createdAt: _c, updatedAt: _u, ...input } = c;
    db.updateCharacter(c.id, { ...input, sheetPageAssetIds: ids });
    broadcast('characters');
  }
}
setTimeout(() => { backfillSheetPages().catch((e) => console.error('backfill failed:', e)); }, 500);

app.listen(PORT, () => {
  // PUBLIC_URL (e.g. https://your-app.up.railway.app) makes the printed links usable as-is once deployed
  const base = (process.env.PUBLIC_URL ?? `http://localhost:${PROD ? PORT : 5173}`).replace(/\/$/, '');
  console.log(`\nCampaign Journal API on port ${PORT}`);
  console.log(`  DM link:     ${base}/?key=${keys.dm}`);
  console.log(`  Player link: ${base}/?key=${keys.player}\n`);
});
