import { useEffect, useState, type FormEvent } from 'react';
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

/** Washi-tape tabs along the top of the notebook. Pages can be added, renamed and deleted from the tabs. */
export function PageTabs({ pages, active, role, onSelect }: Props) {
  const toast = useToast();
  const isDm = role === 'dm';
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => setConfirmDelete(null), [active]);

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
        style={{ ['--tab' as string]: '#E8E3D6' }}
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
        const color = { ['--tab' as string]: TAB_COLORS[i % TAB_COLORS.length] };
        if (!isActive || !isDm)
          return (
            <button key={p.id} type="button" className={`tab${isActive ? ' tab--active' : ''}`} style={color}
              onClick={() => onSelect(p.id)} aria-current={isActive ? 'page' : undefined}>
              {p.title}
            </button>
          );
        // the open page's tab carries its own rename / delete controls
        return (
          <div key={p.id} className="tab tab--active tab--tools" style={color}>
            <button type="button" className="tab-title" aria-current="page" title="双击重命名"
              onDoubleClick={() => { setEditing(p.id); setDraft(p.title); }}>
              {p.title}
            </button>
            <button type="button" className="tab-icon" onClick={() => { setEditing(p.id); setDraft(p.title); }} aria-label="重命名这一页" title="重命名">✎</button>
            {confirmDelete === p.id ? (
              <button type="button" className="tab-icon tab-icon--danger" onClick={() => remove(p.id)}>确认删除</button>
            ) : (
              <button type="button" className="tab-icon" onClick={() => setConfirmDelete(p.id)} aria-label="删除这一页" title="删除">✕</button>
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
