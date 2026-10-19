/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The font of an issued PDF. jsPDF's standard fonts are WinAnsi, which has no
 * ș, ț (nor most of Latin Extended-A), so the PDF embeds Inter (SIL Open Font
 * License; `public/fonts/Inter-OFL.txt`), regular and bold, loaded when an
 * issue is made and not before. The sheet's text asks for the system UI font
 * (`ui-sans-serif, system-ui, sans-serif`), which a PDF cannot name, so the
 * sheet's `font-family` is pointed at the embedded one before svg2pdf draws it.
 */

import type { jsPDF } from 'jspdf';

export const FONT_FAMILY = 'Inter';
export const FONT_FILES = { normal: '/fonts/Inter-Regular.ttf', bold: '/fonts/Inter-Bold.ttf' } as const;

export type FontLoader = (url: string) => Promise<Uint8Array>;

/** The browser's loader: the font files are served from `public/fonts/`. */
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

/** Embed regular and bold under the family name and make regular the document's font. */
export async function embedFonts(doc: jsPDF, load: FontLoader = fetchFont): Promise<void> {
  for (const style of ['normal', 'bold'] as const) {
    const file = FONT_FILES[style].split('/').pop() ?? '';
    doc.addFileToVFS(file, binary(await load(FONT_FILES[style])));
    doc.addFont(file, FONT_FAMILY, style, undefined, 'Identity-H');
  }
  doc.setFont(FONT_FAMILY, 'normal');
}

/** Point every text in the sheet at the embedded family: its own `font-family` attributes and styles, and the root's for text that inherits. */
export function useEmbeddedFont(root: Element): void {
  root.setAttribute('font-family', FONT_FAMILY);
  for (const el of Array.from(root.querySelectorAll('[font-family],[style*="font-family"]'))) {
    if (el.hasAttribute('font-family')) el.setAttribute('font-family', FONT_FAMILY);
    const style = (el as SVGElement).style;
    if (style?.fontFamily) style.fontFamily = FONT_FAMILY;
  }
}
