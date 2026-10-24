import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { getDocument, AnnotationMode } from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const PDFJS_DIR = dirname(require.resolve('pdfjs-dist/package.json'));

// Field values are drawn with the app's own typeface (Latin + common Chinese), so filled-in
// Chinese text renders correctly even when a sheet's stored appearance streams are mis-encoded.
const FONT = 'Journal Hand';
GlobalFonts.registerFromPath(join(process.cwd(), 'web', 'src', 'assets', 'fonts', 'journal-hand.woff2'), FONT);

interface Widget {
  subtype: string;
  fieldType?: string;
  fieldValue?: string | string[];
  rect: number[];
  multiLine?: boolean;
  textAlignment?: number;
  checkBox?: boolean;
  radioButton?: boolean;
  exportValue?: string;
  buttonValue?: string;
  defaultAppearanceData?: { fontSize?: number };
}

/**
 * Renders every page of a character sheet to WebP: the blank page from pdf.js, then each form
 * field's value written into its box.
 */
export async function renderPdfPages(bytes: Uint8Array, { scale = 1.5, maxPages = 6 } = {}): Promise<Buffer[]> {
  const doc = await getDocument({
    data: bytes,
    verbosity: 0, // errors only: official sheets trigger harmless "push button" warnings
    cMapUrl: join(PDFJS_DIR, 'cmaps') + '/',
    cMapPacked: true,
    standardFontDataUrl: join(PDFJS_DIR, 'standard_fonts') + '/',
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  try {
    const out: Buffer[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport,
        annotationMode: AnnotationMode.DISABLE,
      }).promise;
      const widgets = ((await page.getAnnotations()) as Widget[]).filter((a) => a.subtype === 'Widget');
      for (const w of widgets) drawField(ctx, w, viewport.convertToViewportRectangle(w.rect), scale);
      out.push(await canvas.encode('webp', 82));
      page.cleanup();
    }
    return out;
  } finally {
    await doc.destroy();
  }
}

function drawField(ctx: SKRSContext2D, w: Widget, r: number[], scale: number) {
  const x = Math.min(r[0], r[2]), y = Math.min(r[1], r[3]);
  const width = Math.abs(r[2] - r[0]), height = Math.abs(r[3] - r[1]);
  if (width < 2 || height < 2) return;

  if (w.fieldType === 'Btn') {
    const on = w.checkBox || w.radioButton
      ? w.fieldValue !== undefined && w.fieldValue !== 'Off' && (w.radioButton ? w.fieldValue === w.buttonValue : true)
      : false;
    if (!on) return;
    ctx.fillStyle = '#1d1d1f';
    ctx.beginPath();
    ctx.arc(x + width / 2, y + height / 2, Math.min(width, height) * 0.32, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (w.fieldType !== 'Tx') return;
  const value = Array.isArray(w.fieldValue) ? w.fieldValue.join(', ') : (w.fieldValue ?? '');
  if (!value.trim()) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = '#1d1d1f';
  ctx.textBaseline = 'alphabetic';
  const pad = 2 * scale;
  const align = w.textAlignment === 1 ? 'center' : w.textAlignment === 2 ? 'right' : 'left';
  ctx.textAlign = align;
  const ax = align === 'center' ? x + width / 2 : align === 'right' ? x + width - pad : x + pad;
  const daSize = (w.defaultAppearanceData?.fontSize ?? 0) * scale;

  if (w.multiLine) {
    let size = daSize || 9.5 * scale;
    let lines = wrap(ctx, value, size, width - pad * 2);
    // shrink until the text fits the box (sheets often use auto-size here)
    while (size > 5 * scale && lines.length * size * 1.2 > height - pad) {
      size -= 0.5 * scale;
      lines = wrap(ctx, value, size, width - pad * 2);
    }
    lines.forEach((line, i) => ctx.fillText(line, ax, y + pad + size * (i + 1) * 1.2 - size * 0.2));
  } else {
    let size = daSize || Math.min(height * 0.72, 14 * scale);
    ctx.font = `${size}px "${FONT}"`;
    while (ctx.measureText(value).width > width - pad * 2 && size > 5 * scale) {
      size -= 0.5 * scale;
      ctx.font = `${size}px "${FONT}"`;
    }
    ctx.fillText(value, ax, y + height / 2 + size * 0.36);
  }
  ctx.restore();
}

/** Line-wraps text for a box: honours newlines, breaks Latin at spaces and CJK anywhere. */
function wrap(ctx: SKRSContext2D, text: string, size: number, maxWidth: number): string[] {
  ctx.font = `${size}px "${FONT}"`;
  const lines: string[] = [];
  for (const para of text.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const token of para.match(/[A-Za-z0-9'’.,:;!?()+\-\/]+\s*|\s+|./gu) ?? []) {
      if (ctx.measureText(line + token).width <= maxWidth || !line) line += token;
      else { lines.push(line.trimEnd()); line = token.trimStart(); }
    }
    lines.push(line);
  }
  return lines;
}
