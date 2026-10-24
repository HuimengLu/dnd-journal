import manifest from './assets/stickers/stickers.json';

/** The 35 die-cut stickers made from the item sheet; files are WebP at 2× their natural size. */
export interface Sticker { id: string; name: string; w: number; h: number; url: string }

const files = import.meta.glob('./assets/stickers/*.webp', { eager: true, import: 'default' }) as Record<string, string>;

export const STICKERS: Sticker[] = manifest.map((s) => ({ ...s, url: files[`./assets/stickers/${s.id}.webp`] }));
export const stickerById = (id: string) => STICKERS.find((s) => s.id === id);

/** dataTransfer type used when a sticker is dragged from the drawer onto the notebook. */
export const STICKER_DRAG_TYPE = 'application/x-journal-sticker';
