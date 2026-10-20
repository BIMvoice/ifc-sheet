/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The font of an issued PDF. jsPDF's standard fonts are WinAnsi, which has no
 * ș, ț (nor most of Latin Extended-A), so the PDF embeds Inter (SIL Open Font
 * License; `public/fonts/Inter-OFL.txt`), regular and bold, loaded when an
 * issue is made and not before. The sheet's sans-serif text (the system UI
 * font, which a PDF cannot name) is pointed at the embedded one before svg2pdf
 * draws it. Serif and monospace text keeps its own family (svg2pdf draws it in
 * Times or Courier) unless it holds a letter WinAnsi lacks; then it is set in
 * Inter and the issue says so. Inter has no CJK glyphs, so text it cannot show
 * is reported too.
 */

import type { jsPDF } from 'jspdf';

export const FONT_FAMILY = 'Inter';
/** The standard font the PDF is written in when Inter could not be loaded. */
export const FALLBACK_FAMILY = 'helvetica';

/** The font files, under the app's base path (`public/fonts/`). */
export function fontUrls(): { normal: string; bold: string } {
  const base = import.meta.env?.BASE_URL ?? '/';
  const dir = `${base.endsWith('/') ? base : `${base}/`}fonts/`;
  return { normal: `${dir}Inter-Regular.ttf`, bold: `${dir}Inter-Bold.ttf` };
}

export type FontLoader = (url: string) => Promise<Uint8Array>;

/** The browser's loader. */
export const fetchFont: FontLoader = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The PDF font ${url} could not be loaded (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
};

const binary = (bytes: Uint8Array) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
};

/**
 * Embed regular and bold under the family name and make regular the document's font. False when a file could not be
 * loaded: the document is then left on the standard font, so the issue still goes out.
 */
export async function embedFonts(doc: jsPDF, load: FontLoader = fetchFont): Promise<boolean> {
  const urls = fontUrls();
  let files: { style: 'normal' | 'bold'; file: string; bytes: Uint8Array }[];
  try {
    files = await Promise.all((['normal', 'bold'] as const).map(async (style) => ({ style, file: urls[style].split('/').pop() ?? '', bytes: await load(urls[style]) })));
  } catch (err) {
    console.warn('[ifcsheet] the PDF font could not be loaded; the PDF uses the standard font', err);
    doc.setFont(FALLBACK_FAMILY, 'normal');
    return false;
  }
  for (const { style, file, bytes } of files) {
    doc.addFileToVFS(file, binary(bytes));
    doc.addFont(file, FONT_FAMILY, style, undefined, 'Identity-H');
  }
  doc.setFont(FONT_FAMILY, 'normal');
  return true;
}

type FamilyKind = 'sans' | 'serif' | 'mono';

/** The generic kind of a CSS `font-family` list, by whole names (`sans-serif` is not `serif`). */
function familyKind(family: string): FamilyKind {
  const names = family.split(',').map((n) => n.trim().replace(/^["']|["']$/g, '').toLowerCase());
  if (names.some((n) => n === 'monospace' || n === 'ui-monospace')) return 'mono';
  if (names.some((n) => n === 'serif' || n === 'ui-serif')) return 'serif';
  return 'sans';
}

/** The characters beyond WinAnsi's printable Latin-1 and its 27 extras, which Times and Courier can show. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const winAnsi = (text: string): boolean => {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (!(c < 0x7f || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch))) return false;
  }
  return true;
};

function familyOf(el: Element): string | null {
  return el.getAttribute('font-family') || (el as SVGElement).style?.fontFamily || null;
}

function setFamily(el: Element, family: string): void {
  if (el.hasAttribute('font-family') || !(el as SVGElement).style?.fontFamily) el.setAttribute('font-family', family);
  const style = (el as SVGElement).style;
  if (style?.fontFamily) style.fontFamily = family;
}

/**
 * Point the sheet's sans-serif text at the embedded family (its own `font-family` attributes and styles, and the
 * root's for text that inherits). Serif and monospace text keeps its family unless Inter is embedded and the text
 * has a letter the standard fonts cannot show. Returns whether any such text was moved to Inter.
 */
export function useEmbeddedFont(root: Element, embedded = true): boolean {
  let replaced = false;
  if (!familyOf(root) && embedded) root.setAttribute('font-family', FONT_FAMILY);
  for (const el of [root, ...Array.from(root.querySelectorAll('[font-family],[style*="font-family"]'))]) {
    const family = familyOf(el);
    if (!family || !embedded) continue;
    if (familyKind(family) === 'sans') setFamily(el, FONT_FAMILY);
    else if (!winAnsi(el.textContent ?? '')) {
      setFamily(el, FONT_FAMILY);
      replaced = true;
    }
  }
  return replaced;
}

/** The characters of `text` the document's embedded font has no glyph for (white space aside), each once. */
export function missingGlyphs(doc: jsPDF, text: string): string[] {
  const prior = doc.getFont();
  doc.setFont(FONT_FAMILY, 'normal');
  const font = doc.getFont() as unknown as { metadata?: { cmap?: { unicode?: { codeMap?: Record<number, number> } } } };
  doc.setFont(prior.fontName, prior.fontStyle);
  const codeMap = font.metadata?.cmap?.unicode?.codeMap;
  if (!codeMap) return [];
  const out = new Set<string>();
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x20 && !codeMap[c]) out.add(ch);
  }
  return [...out];
}
