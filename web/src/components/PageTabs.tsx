import { useState, type FormEvent } from 'react';
import type { JournalPage, Role } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useToast } from './Toasts.tsx';

export const OVERVIEW_ID = 'overview';

interface Props {
  pages: JournalPage[];
  active: string;
  role: Role;
  onSelect: (id: string) => void;
}

const TAB_COLORS = ['#E8E3D6', '#E9C9A8', '#D9D2F2', '#D3E6CF', '#F6DCC9', '#CFE0F0'];

/** Washi-tape tabs along the top of the notebook. The DM can add, rename, reorder and delete pages. */
export function PageTabs({ pages, active, role, onSelect }: Props) {
  const toast = useToast();
  const isDm = role === 'dm';
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fail = (e: unknown) => toast({ tone: 'error', message: e instanceof Error ? e.message : '操作失败' });

  const submitRename = async (e: FormEvent) => {
    e.preventDefault();
    const id = editing!;
    setEditing(null);
    if (!draft.trim() || draft.trim() === pages.find((p) => p.id === id)?.title) return;
    try { await api.renamePage(id, draft.trim()); } catch (err) { fail(err); }
  };
  const submitAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(false);
    if (!draft.trim()) return;
    try { const p = await api.createPage(draft.trim()); onSelect(p.id); } catch (err) { fail(err); }
  };
  const move = async (id: string, dir: -1 | 1) => {
    const ids = pages.map((p) => p.id);
    const i = ids.indexOf(id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await api.reorderPages(ids); } catch (err) { fail(err); }
  };
  const remove = async (id: string) => {
    setConfirmDelete(null);
    try {
      await api.deletePage(id);
      if (active === id) onSelect(OVERVIEW_ID);
    } catch (err) { fail(err); }
  };

  return (
    <>
      <button
        type="button"
        className={`tab${active === OVERVIEW_ID ? ' tab--active' : ''}`}
        style={{ ['--tab' as string]: '#F7F2E7' }}
        onClick={() => onSelect(OVERVIEW_ID)}
        aria-current={active === OVERVIEW_ID ? 'page' : undefined}
      >
        角色总览
      </button>
      {pages.map((p, i) => {
        const isActive = active === p.id;
        if (editing === p.id)
          return (
            <form key={p.id} className="tab tab--active tab--form" style={{ ['--tab' as string]: TAB_COLORS[i % TAB_COLORS.length] }} onSubmit={submitRename}>
              <label htmlFor={`rename-${p.id}`} className="sr-only">页面名称</label>
              <input id={`rename-${p.id}`} autoFocus value={draft} maxLength={24} onChange={(e) => setDraft(e.target.value)} onBlur={submitRename} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} />
            </form>
          );
        return (
          <div key={p.id} className={`tab-wrap${isActive ? ' tab-wrap--active' : ''}`}>
            <button
              type="button"
              className={`tab${isActive ? ' tab--active' : ''}`}
              style={{ ['--tab' as string]: TAB_COLORS[i % TAB_COLORS.length] }}
              onClick={() => onSelect(p.id)}
              onDoubleClick={() => { if (isDm) { setEditing(p.id); setDraft(p.title); } }}
              aria-current={isActive ? 'page' : undefined}
              title={isDm ? '双击重命名' : undefined}
            >
              {p.title}
            </button>
            {isDm && isActive && (
              <div className="tab-tools">
                <button type="button" onClick={() => move(p.id, -1)} disabled={i === 0} aria-label="左移这一页">←</button>
                <button type="button" onClick={() => move(p.id, 1)} disabled={i === pages.length - 1} aria-label="右移这一页">→</button>
                <button type="button" onClick={() => { setEditing(p.id); setDraft(p.title); }} aria-label="重命名这一页">✎</button>
                {confirmDelete === p.id ? (
                  <button type="button" className="tab-tools-danger" onClick={() => remove(p.id)}>确认删除</button>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(p.id)} aria-label="删除这一页">✕</button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {isDm &&
        (adding ? (
          <form className="tab tab--form" style={{ ['--tab' as string]: '#FFFFFF' }} onSubmit={submitAdd}>
            <label htmlFor="new-page" className="sr-only">新页面名称</label>
            <input id="new-page" autoFocus placeholder="新页面" value={draft} maxLength={24} onChange={(e) => setDraft(e.target.value)} onBlur={submitAdd} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
          </form>
        ) : (
          <button type="button" className="tab tab--add" onClick={() => { setAdding(true); setDraft(''); }} aria-label="新建页面">＋</button>
        ))}
    </>
  );
}
