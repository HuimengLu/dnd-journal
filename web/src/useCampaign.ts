import { useCallback, useEffect, useRef, useState } from 'react';
import type { CampaignState, Character, CharacterInput, Role } from '../../shared/types.ts';
import { api, ApiError, subscribe } from './api.ts';

export type LoadState =
  | { status: 'loading' }
  | { status: 'unauthorized'; message: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; role: Role; data: CampaignState };

/** Loads the campaign, keeps it live over server-sent events, and offers optimistic character edits. */
export function useCampaign() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [online, setOnline] = useState(true);
  const role = useRef<Role>('player');
  const refreshTimer = useRef<number | undefined>(undefined);
  // HP edits in flight: their optimistic values must survive refreshes until the server answers
  const pending = useRef(new Map<string, Partial<CharacterInput>>());

  const applyPending = (data: CampaignState): CampaignState => {
    if (pending.current.size === 0) return data;
    return { ...data, characters: data.characters.map((c) => (pending.current.has(c.id) ? { ...c, ...pending.current.get(c.id) } : c)) };
  };

  const refresh = useCallback(async () => {
    try {
      const data = await api.state();
      setLoad({ status: 'ready', role: role.current, data: applyPending(data) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setLoad({ status: 'unauthorized', message: e.message });
      else setLoad((prev) => (prev.status === 'ready' ? prev : { status: 'error', message: e instanceof Error ? e.message : '加载失败' }));
    }
  }, []);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        const s = await api.session();
        role.current = s.role;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return setLoad({ status: 'unauthorized', message: e.message });
        return setLoad({ status: 'error', message: e instanceof Error ? e.message : '加载失败' });
      }
      await refresh();
      unsub = subscribe(
        () => {
          window.clearTimeout(refreshTimer.current);
          refreshTimer.current = window.setTimeout(refresh, 120);
        },
        setOnline,
      );
    })();
    return () => unsub();
  }, [refresh]);

  const patchLocal = (id: string, patch: Partial<Character>) =>
    setLoad((prev) =>
      prev.status === 'ready'
        ? { ...prev, data: { ...prev.data, characters: prev.data.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) } }
        : prev,
    );

  /** Optimistic update; rolls back and rethrows if the server refuses. */
  const updateCharacter = useCallback(async (id: string, patch: Partial<CharacterInput>, previous: Partial<CharacterInput>) => {
    pending.current.set(id, { ...pending.current.get(id), ...patch });
    patchLocal(id, patch);
    try {
      const saved = await api.updateCharacter(id, patch);
      pending.current.delete(id);
      patchLocal(id, saved);
      return saved;
    } catch (e) {
      pending.current.delete(id);
      patchLocal(id, previous);
      throw e;
    }
  }, []);

  return { load, online, refresh, updateCharacter };
}
