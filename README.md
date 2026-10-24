# Campaign Journal

A private, shared journal for one D&D campaign: a character status dashboard plus freeform scrapbook pages, styled after the Figma file (BG 01 Paper Grain background 20:925, Ballpoint character cards).

## Run it

Requires Node 22.13+ (uses the built-in `node:sqlite`).

```bash
npm install
npm run dev
```

By default the site is open: anyone with its address can use it, no key needed. To make it private, set `REQUIRE_INVITE=1`; the server then prints two private links on start:

- **DM link** and **Player link** have the same permissions: anyone at the table can add characters, import PDFs, edit stats, arrange pages, upload images and place stickers.

The "DM / 玩家" chip in the top bar is a per-viewer label (click to switch); it only changes the default name on dice rolls. Anyone can copy the player link with "邀请玩家". Keys live in `data/keys.json`; delete that file and restart to rotate both links.

For a session with friends, build once and run a single server, then expose that port (for example with a tunnel or a small VPS):

```bash
npm run build
PORT=8787 npm start
```

## Deploy (Railway)

The app needs a long-running Node server and a persistent disk (SQLite database, uploads, link keys), so static hosts such as Vercel won't work.

1. On railway.com: New Project → Deploy from GitHub repo → this repository.
2. In the service: add a Volume mounted at `/data`.
3. Variables: `DATA_DIR=/data`, and after step 4, `PUBLIC_URL=https://<your-domain>`.
4. Settings → Networking → Generate Domain.
5. Redeploy and open the domain. (With `REQUIRE_INVITE=1`, read the DM and player links from the deploy logs instead.)

`railway.json` sets the build (`npm run build`) and start (`npm start`) commands; Railway provides `PORT`.

## What's in the MVP

- **Character overview**: cards from Figma 19:144. Six hearts always; they empty in half-heart steps by current/max HP, and turn red at ≤ ⅓ HP (Figma 19:241). Click the number under the hearts (or the HP bar) to set HP exactly. The DM can drag cards anywhere on the spread (positions are shared).
- **PDF import**: upload a fillable 5e sheet, review every extracted field, then save. Nothing is saved without confirmation; same-name imports create a new character instead of overwriting. The original PDF stays linked from the detail panel.
- **Paper**: three swatches left of the notebook switch the current page to large-grid, lined or small-grid paper (small-grid is the default). The choice is remembered per page in each viewer's browser.
- **Detail popup**: click a card to open a centred sheet over a veiled page (close with ✕, Esc or a click outside). HP ± buttons, exact HP, temp HP, all 15 conditions (stored as ids), unconscious stamp, ability scores, edit/delete (DM).
- **Journal pages**: DM creates, renames (double-click tab), reorders and deletes pages; uploads JPEG/PNG/WebP (button or drag-and-drop); drags, resizes (aspect-locked), layers and removes images and character cards. Layouts persist.
- **Slot help**: hover an attack or potion slot for a one-line hint; click it for a paper note with the full description (DM can edit both per attack).
- **Quick edits**: single-click HP (anyone), gold or potion count (DM); double-click a card for the detail popup.
- **Live sync**: server-sent events push every change to everyone; failed writes roll back with an error toast. HP changes offer one-click undo.

## Layout

```
server/    Express API, SQLite storage, PDF field extraction, uploads (data/uploads)
shared/    Types and rules used by both sides (conditions, heart math, permissions)
web/       React + Vite client; assets/figma holds the exported Figma SVGs
```

## Fonts

All text — Chinese and English — uses one typeface: a subset of 小赖字体 (Xiaolai, SIL OFL 1.1; licence in `web/src/assets/fonts/OFL.txt`), renamed "Journal Hand" per the OFL. If you add UI text with Chinese characters outside GB2312 level 1, rerun `scripts/subset-cjk-font.py`.

Not in this MVP (PRD P1/P2): dice roller, initiative tracker, sticky notes, map tokens.
