import { useCallback, useEffect, useRef, useState } from 'react';
import type { CampaignState, Character, CharacterInput, Role, SlotInfo } from '../../shared/types.ts';
import { api } from './api.ts';
import { useCampaign } from './useCampaign.ts';
import { DEFAULT_PAPER, Notebook, PAPERS, SPREAD, Stage, type Paper } from './components/Notebook.tsx';
import { OVERVIEW_ID, PageTabs } from './components/PageTabs.tsx';
import { OverviewPage } from './components/OverviewPage.tsx';
import { JournalCanvas } from './components/JournalCanvas.tsx';
import { DetailPanel } from './components/DetailPanel.tsx';
import { ImportModal } from './components/ImportModal.tsx';
import { HpEditor } from './components/HpEditor.tsx';
import { QuickEditor } from './components/QuickEditor.tsx';
import { SlotNote, SlotTooltip, pickTilt, sourceTilt } from './components/SlotHelp.tsx';
import { CARD_H, CARD_W } from './components/CharacterCard.tsx';
import { useToast } from './components/Toasts.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { stickerById, type Sticker } from './stickers.ts';

const PAGE_STORAGE = 'campaign-journal-page';
const PAPER_STORAGE = 'campaign-journal-paper';

/** Paper is a per-viewer choice, remembered per page (tab) in this browser. */
function usePaperChoice() {
  const [map, setMap] = useState<Record<string, Paper>>(() => {
    try { return JSON.parse(localStorage.getItem(PAPER_STORAGE) ?? '{}'); } catch { return {}; }
  });
  const set = (pageId: string, paper: Paper) =>
    setMap((m) => {
      const next = { ...m, [pageId]: paper };
      try { localStorage.setItem(PAPER_STORAGE, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  return [map, set] as const;
}

export function App() {
  const { load, online, updateCharacter } = useCampaign();

  if (load.status === 'loading') return <Splash title="正在翻开手帐…" />;
  if (load.status === 'unauthorized')
    return <Splash title="需要邀请链接" body="这本手帐是私密的。请用 DM 发给你的链接打开，链接里带着访问密钥。" />;
  if (load.status === 'error') return <Splash title="打不开手帐" body={`${load.message}。请确认服务器正在运行，然后刷新页面。`} />;
  return <Journal data={load.data} role={load.role} online={online} updateCharacter={updateCharacter} />;
}

function Splash({ title, body }: { title: string; body?: string }) {
  return (
    <main className="splash">
      <div className="splash-card sheet">
        <h1>{title}</h1>
        {body && <p>{body}</p>}
      </div>
    </main>
  );
}

interface JournalProps {
  data: CampaignState;
  role: Role;
  online: boolean;
  updateCharacter: (id: string, patch: Partial<CharacterInput>, previous: Partial<CharacterInput>) => Promise<Character>;
}

function Journal({ data, role, online, updateCharacter }: JournalProps) {
  const toast = useToast();
  const isDm = role === 'dm';
  const [active, setActive] = useState<string>(() => { try { return localStorage.getItem(PAGE_STORAGE) ?? OVERVIEW_ID; } catch { return OVERVIEW_ID; } });
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [hpEdit, setHpEdit] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [tip, setTip] = useState<{ info: SlotInfo; anchor: HTMLElement } | null>(null);
  const [note, setNote] = useState<{ info: SlotInfo; anchor: HTMLElement; tilt: number } | null>(null);
  const [quick, setQuick] = useState<{ id: string; field: 'gold' | 'potions'; anchor: HTMLElement } | null>(null);
  const [busy, setBusy] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [papers, setPaper] = usePaperChoice();

  // fall back to the overview if the open page was deleted (possibly by someone else)
  const page = data.pages.find((p) => p.id === active);
  useEffect(() => { if (active !== OVERVIEW_ID && !page) setActive(OVERVIEW_ID); }, [active, page]);
  useEffect(() => { try { localStorage.setItem(PAGE_STORAGE, active); } catch { /* ignore */ } }, [active]);
  useEffect(() => { if (openId && !data.characters.some((c) => c.id === openId)) setOpenId(null); }, [openId, data.characters]);

  const open = data.characters.find((c) => c.id === openId) ?? null;
  const hpChar = hpEdit ? data.characters.find((c) => c.id === hpEdit.id) : null;
  const quickChar = quick ? data.characters.find((c) => c.id === quick.id) : null;

  /** Saves a change and offers one-click undo (PRD 5.5: correct an accidental change). */
  const change = useCallback(async (c: Character, patch: Partial<CharacterInput>, label: string) => {
    const previous = Object.fromEntries(Object.keys(patch).map((k) => [k, c[k as keyof Character]])) as Partial<CharacterInput>;
    await updateCharacter(c.id, patch, previous);
    const hpText = patch.hpCurrent !== undefined && patch.hpCurrent !== c.hpCurrent ? `：${c.hpCurrent} → ${patch.hpCurrent}` : '';
    toast({
      tone: 'info',
      message: `已更新 ${c.name} 的${label}${hpText}`,
      action: {
        label: '撤销',
        run: () => updateCharacter(c.id, previous, patch).catch((e) => toast({ tone: 'error', message: e instanceof Error ? e.message : '撤销失败' })),
      },
    });
  }, [updateCharacter, toast]);

  const placeImage = async (file: File, at?: { x: number; y: number }) => {
    if (!page) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast({ tone: 'error', message: '只支持 JPEG、PNG、WebP 图片' });
    setBusy(true);
    toast({ tone: 'info', message: `正在上传 ${file.name}…` });
    try {
      const asset = await api.uploadImage(file);
      const ratio = asset.width && asset.height ? asset.height / asset.width : 0.66;
      let w = 560, h = w * ratio;
      if (h > 460) { h = 460; w = h / ratio; }
      const cx = at?.x ?? SPREAD.w / 2 + (Math.random() * 80 - 40), cy = at?.y ?? SPREAD.h / 2 + (Math.random() * 60 - 30);
      await api.createObject(page.id, { type: 'image', ref: asset.id, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h), rotation: Math.round((Math.random() * 4 - 2) * 10) / 10 });
      toast({ tone: 'info', message: '图片已放到这一页，可以拖动或缩放' });
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : '上传失败' });
    } finally {
      setBusy(false);
    }
  };

  /** Stickers go on the open page, or on the hidden page behind the character overview. */
  const placeSticker = async (s: Sticker, at?: { x: number; y: number }) => {
    const pageId = page ? page.id : data.overviewPageId;
    const w = Math.round(s.w * 0.8), h = Math.round(s.h * 0.8);
    // dropped: centre on the drop point; clicked: near the middle of the spread
    const cx = at?.x ?? SPREAD.w / 2 + Math.random() * 240 - 120, cy = at?.y ?? SPREAD.h / 2 + Math.random() * 160 - 80;
    try {
      await api.createObject(pageId, {
        type: 'sticker', ref: s.id, w, h,
        x: Math.round(cx - w / 2), y: Math.round(cy - h / 2),
        rotation: Math.round((Math.random() * 16 - 8) * 10) / 10,
      });
    } catch (e) { toast({ tone: 'error', message: e instanceof Error ? e.message : '贴纸没有贴上' }); }
  };

  // let everyone know when someone else rolls
  const myRolls = useRef(new Set<string>());
  const seenRoll = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const latest = data.rolls[0];
    if (seenRoll.current === undefined) { seenRoll.current = latest?.id ?? null; return; }
    if (!latest || latest.id === seenRoll.current) return;
    seenRoll.current = latest.id;
    if (!myRolls.current.has(latest.id)) toast({ tone: 'info', message: `${latest.roller} 掷了 ${latest.expression}：${latest.total}` });
  }, [data.rolls, toast]);

  /** Panel "添加图片": a new journal page named after the file, with the image fitted in the middle. */
  const addImagePage = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast({ tone: 'error', message: '只支持 JPEG、PNG、WebP 图片' });
    setBusy(true);
    toast({ tone: 'info', message: `正在上传 ${file.name}…` });
    try {
      const asset = await api.uploadImage(file);
      const title = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 24) || '新页面';
      const newPage = await api.createPage(title);
      const ratio = asset.width && asset.height ? asset.height / asset.width : 0.66;
      let w = 900, h = w * ratio;
      if (h > 640) { h = 640; w = h / ratio; }
      await api.createObject(newPage.id, { type: 'image', ref: asset.id, x: Math.round((SPREAD.w - w) / 2), y: Math.round((SPREAD.h - h) / 2), w: Math.round(w), h: Math.round(h), rotation: Math.round((Math.random() * 3 - 1.5) * 10) / 10 });
      setActive(newPage.id);
      toast({ tone: 'info', message: `已新建「${title}」页，图片可以拖动或缩放` });
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : '上传失败' });
    } finally {
      setBusy(false);
    }
  };

  const placeCharacter = async (c: Character) => {
    setPlaceOpen(false);
    if (!page) return;
    const w = Math.round(CARD_W * 0.75), h = Math.round(CARD_H * 0.75);
    try {
      await api.createObject(page.id, { type: 'character', ref: c.id, x: Math.round(SPREAD.w / 2 - w / 2 + Math.random() * 60 - 30), y: Math.round(SPREAD.h / 2 - h / 2), w, h, rotation: 0 });
    } catch (e) { toast({ tone: 'error', message: e instanceof Error ? e.message : '放置失败' }); }
  };

  /** "邀请玩家": copies the private player link to the clipboard. */
  const copyPlayerLink = async () => {
    try {
      const { playerKey } = await api.links();
      const url = `${window.location.origin}/?key=${playerKey}`;
      await navigator.clipboard.writeText(url);
      toast({ tone: 'info', message: '玩家链接已复制，发给队友就能打开' });
    } catch {
      toast({ tone: 'error', message: '复制失败，可以在服务器控制台里找到玩家链接' });
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">
          <span className="topbar-campaign">{data.campaign.name}</span>
          <span className={`role-chip role-chip--${role}`}>{isDm ? 'DM' : '玩家'}</span>
          <span className={`sync${online ? '' : ' sync--off'}`} role="status">{online ? '已同步' : '连接中断，正在重连…'}</span>
        </div>
        <div className="topbar-actions">
          {isDm && page && (
            <>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? '上传中…' : '上传图片'}</button>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) placeImage(f); }} />
              <div className="menu">
                <button type="button" className="btn btn--ghost" aria-expanded={placeOpen} onClick={() => setPlaceOpen((o) => !o)} disabled={data.characters.length === 0}>放入角色卡 ▾</button>
                {placeOpen && (
                  <ul className="menu-list">
                    {data.characters.map((c) => <li key={c.id}><button type="button" onClick={() => placeCharacter(c)}>{c.name}</button></li>)}
                  </ul>
                )}
              </div>
            </>
          )}
          {isDm && <button type="button" className="btn btn--ghost" onClick={copyPlayerLink}>邀请玩家</button>}
        </div>
      </header>

      <Stage>
        <Notebook
          tabs={<PageTabs pages={data.pages} active={page ? page.id : OVERVIEW_ID} role={role} onSelect={setActive} />}
          paper={PAPERS.some((p) => p.id === papers[page ? page.id : OVERVIEW_ID]) ? papers[page ? page.id : OVERVIEW_ID] : DEFAULT_PAPER}
          onPaperChange={(p) => setPaper(page ? page.id : OVERVIEW_ID, p)}
          onDropSticker={isDm ? (id, at) => { const s = stickerById(id); if (s) placeSticker(s, at); } : undefined}
          tools={
            <Toolbar
              role={role}
              rolls={data.rolls}
              onAddCharacter={() => setImporting(true)}
              onPlaceSticker={placeSticker}
              onAddImage={addImagePage}
              onRolled={(id) => myRolls.current.add(id)}
            />
          }
        >
          {page ? (
            <JournalCanvas
              pageId={page.id}
              objects={data.objects}
              characters={data.characters}
              role={role}
              onOpen={(id) => { setNote(null); setTip(null); setOpenId(id); }}
              onEditHp={(id, anchor) => setHpEdit({ id, anchor })}
              onQuickEdit={(id, field, anchor) => setQuick({ id, field, anchor })}
              onSlotHover={(info, anchor) => setTip(info && anchor ? { info, anchor } : null)}
              onSlotOpen={(info, anchor) => { setTip(null); setNote({ info, anchor, tilt: pickTilt(sourceTilt(anchor)) }); }}
              onDropImage={placeImage}
            />
          ) : (
            <OverviewPage
              characters={data.characters}
              positions={data.overview}
              role={role}
              onOpen={(id) => { setNote(null); setTip(null); setOpenId(id); }}
              onEditHp={(id, anchor) => setHpEdit({ id, anchor })}
              onQuickEdit={(id, field, anchor) => setQuick({ id, field, anchor })}
              onSlotHover={(info, anchor) => setTip(info && anchor ? { info, anchor } : null)}
              onSlotOpen={(info, anchor) => { setTip(null); setNote({ info, anchor, tilt: pickTilt(sourceTilt(anchor)) }); }}
              onAddCharacter={() => setImporting(true)}
            />
          )}
          {!page && (
            <JournalCanvas
              overlay
              pageId={data.overviewPageId}
              objects={data.objects}
              characters={data.characters}
              role={role}
              onOpen={(id) => { setNote(null); setTip(null); setOpenId(id); }}
              onEditHp={(id, anchor) => setHpEdit({ id, anchor })}
              onQuickEdit={(id, field, anchor) => setQuick({ id, field, anchor })}
              onSlotHover={(info, anchor) => setTip(info && anchor ? { info, anchor } : null)}
              onSlotOpen={(info, anchor) => { setTip(null); setNote({ info, anchor, tilt: pickTilt(sourceTilt(anchor)) }); }}
            />
          )}
        </Notebook>
      </Stage>


      {open && (
        <DetailPanel
          character={open}
          role={role}
          onClose={() => setOpenId(null)}
          onUpdate={(patch, label) => change(open, patch, label)}
          onDeleted={() => setOpenId(null)}
        />
      )}
      {hpEdit && hpChar && (
        <HpEditor
          character={hpChar}
          anchor={hpEdit.anchor}
          onClose={() => setHpEdit(null)}
          onSave={async (hpCurrent, hpTemp) => {
            const patch: Partial<CharacterInput> = {};
            if (hpCurrent !== hpChar.hpCurrent) patch.hpCurrent = hpCurrent;
            if (hpTemp !== hpChar.hpTemp) patch.hpTemp = hpTemp;
            if (Object.keys(patch).length) await change(hpChar, patch, '生命值');
          }}
        />
      )}
      {tip && !note && <SlotTooltip info={tip.info} anchor={tip.anchor} />}
      {note && <SlotNote info={note.info} anchor={note.anchor} tilt={note.tilt} onClose={() => setNote(null)} />}
      {quick && quickChar && (
        <QuickEditor
          title={quickChar.name}
          label={quick.field === 'gold' ? '金币 GP' : '药水数量'}
          value={quickChar[quick.field]}
          min={0}
          max={quick.field === 'gold' ? 9_999_999 : 99}
          nudges={quick.field === 'gold' ? [-10, -1, +1, +10] : [-1, +1]}
          anchor={quick.anchor}
          onClose={() => setQuick(null)}
          onSave={(value) => change(quickChar, { [quick.field]: value }, quick.field === 'gold' ? '金币' : '药水')}
        />
      )}
      {importing && (
        <ImportModal
          characters={data.characters}
          onClose={() => setImporting(false)}
          onCreated={(c) => { setImporting(false); setActive(OVERVIEW_ID); setOpenId(c.id); toast({ tone: 'info', message: `${c.name} 已加入角色总览` }); }}
        />
      )}
    </div>
  );
}
