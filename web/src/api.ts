import type { Asset, CampaignState, Character, CharacterInput, DiceRoll, JournalObject, JournalPage, OverviewPosition, PdfImportResult, Role } from '../../shared/types.ts';

const KEY_STORAGE = 'campaign-journal-key';

/** The private link carries ?key=…; keep it in localStorage and drop it from the address bar. */
export function readKey(): string | null {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('key');
  if (fromUrl) {
    try { localStorage.setItem(KEY_STORAGE, fromUrl); } catch { /* private mode: keep it in memory only */ }
    url.searchParams.delete('key');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    memoryKey = fromUrl;
    return fromUrl;
  }
  if (memoryKey) return memoryKey;
  try { return localStorage.getItem(KEY_STORAGE); } catch { return null; }
}
let memoryKey: string | null = null;

export function forgetKey() {
  memoryKey = null;
  try { localStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly field?: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = readKey() ?? '';
  const init: RequestInit = { method, headers: { 'x-campaign-key': key } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError('连不上服务器，请检查网络后再试', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `请求失败（${res.status}）`, res.status, data.field);
  return data as T;
}

export const api = {
  session: () => request<{ role: Role; campaign: { id: string; name: string } }>('GET', '/session'),
  state: () => request<CampaignState>('GET', '/state'),
  links: () => request<{ playerKey: string; requireInvite: boolean }>('GET', '/links'),

  createCharacter: (input: CharacterInput) => request<Character>('POST', '/characters', input),
  updateCharacter: (id: string, patch: Partial<CharacterInput>) => request<Character>('PATCH', `/characters/${id}`, patch),
  deleteCharacter: (id: string) => request<void>('DELETE', `/characters/${id}`),

  importPdf: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<PdfImportResult>('POST', '/import/pdf', fd);
  },
  uploadImage: async (file: File) => {
    const fd = new FormData();
    const size = await imageSize(file);
    if (size) { fd.append('width', String(size.w)); fd.append('height', String(size.h)); }
    fd.append('file', file);
    return request<Asset>('POST', '/assets', fd);
  },

  createPage: (title: string) => request<JournalPage>('POST', '/pages', { title }),
  renamePage: (id: string, title: string) => request<JournalPage>('PATCH', `/pages/${id}`, { title }),
  reorderPages: (ids: string[]) => request<JournalPage[]>('POST', '/pages/reorder', { ids }),
  deletePage: (id: string) => request<void>('DELETE', `/pages/${id}`),

  createObject: (pageId: string, o: Pick<JournalObject, 'type' | 'ref' | 'x' | 'y' | 'w' | 'h' | 'rotation'>) =>
    request<JournalObject>('POST', `/pages/${pageId}/objects`, o),
  updateObject: (id: string, patch: Partial<Pick<JournalObject, 'x' | 'y' | 'w' | 'h' | 'rotation'>> & { layer?: 'front' | 'back' }) =>
    request<JournalObject>('PATCH', `/objects/${id}`, patch),
  deleteObject: (id: string) => request<void>('DELETE', `/objects/${id}`),

  moveOverviewCard: (characterId: string, x: number, y: number) => request<OverviewPosition>('PUT', `/overview/${characterId}`, { x, y }),

  rollDice: (expression: string, roller: string) => request<DiceRoll>('POST', '/rolls', { expression, roller }),
};

/** Asset URLs carry the key because <img> and <a> cannot send headers. */
export const assetUrl = (id: string) => `/api/assets/${id}?key=${encodeURIComponent(readKey() ?? '')}`;

async function imageSize(file: File): Promise<{ w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const s = { w: bmp.width, h: bmp.height };
    bmp.close();
    return s;
  } catch {
    return null;
  }
}

export function subscribe(onChange: () => void, onStatus: (online: boolean) => void): () => void {
  const es = new EventSource(`/api/events?key=${encodeURIComponent(readKey() ?? '')}`);
  es.addEventListener('hello', () => { onStatus(true); onChange(); });
  es.addEventListener('change', () => onChange());
  es.onerror = () => onStatus(false); // EventSource reconnects on its own; "hello" fires again
  return () => es.close();
}
