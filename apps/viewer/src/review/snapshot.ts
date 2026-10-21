/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The thumbnail a BCF viewpoint carries: the sheet around the pin, cut from
 * the paper SVG the exports read (`sheetSvgText`), with a ring where the pin
 * is, as a PNG. Other BCF tools list topics by this picture. A sheet whose
 * paper is not on the page (the Wall not showing it) gets no thumbnail; the
 * topic goes out without one, as before.
 */

import { sheetSvgText, type PaperCrop } from '@/components/viewer/sheets/sheet-export';
import { paperOf } from '@/project/sheets';
import type { ProjectSheet } from '@/project/types';
import type { ReviewComment } from './types';

/** The crop around a pin, paper millimetres: 4:3, the viewpoint camera's aspect. */
export const CROP_MM = { w: 120, h: 90 };
/** Pixels per paper millimetre of the thumbnail (720 x 540 px for the full crop). */
const PX_PER_MM = 6;
/** How long one picture may take to draw before the topic goes without it. */
const DRAW_MS = 5_000;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The window of the paper around a pin, kept inside the paper. */
export function cropAround(sheet: ProjectSheet, at: { x: number; y: number }): PaperCrop {
  const paper = paperOf(sheet);
  const w = Math.min(CROP_MM.w, paper.w);
  const h = Math.min(CROP_MM.h, paper.h);
  return { x: clamp(at.x - w / 2, 0, paper.w - w), y: clamp(at.y - h / 2, 0, paper.h - h), w, h };
}

/** The sheet around a comment's pin as a standalone SVG, the pin ringed. */
export function pinCropSvg(svg: SVGSVGElement, sheet: ProjectSheet, c: Pick<ReviewComment, 'x' | 'y'>): { text: string; crop: PaperCrop } {
  const crop = cropAround(sheet, c);
  const ring = `<circle cx="${c.x}" cy="${c.y}" r="2.5" fill="none" stroke="#e11d48" stroke-width="0.7"/>`;
  const text = sheetSvgText(svg, sheet, crop);
  const end = text.lastIndexOf('</svg>');
  return { text: end < 0 ? text : `${text.slice(0, end)}${ring}${text.slice(end)}`, crop };
}

/** An SVG drawn to a PNG data URL, or null when the browser cannot draw it (in time). */
export function svgToPng(text: string, widthPx: number, heightPx: number): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    const done = (value: string | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => {
      console.warn('[ifcsheet] the BCF thumbnail took too long to draw');
      done(null);
    }, DRAW_MS);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = widthPx;
        canvas.height = heightPx;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2D canvas');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, widthPx, heightPx);
        ctx.drawImage(img, 0, 0, widthPx, heightPx);
        const png = canvas.toDataURL('image/png');
        // A browser out of canvas memory returns "data:," without throwing.
        done(png.startsWith('data:image/png') ? png : null);
      } catch (err) {
        console.warn('[ifcsheet] could not draw the BCF thumbnail', err);
        done(null);
      }
    };
    img.onerror = () => {
      console.warn('[ifcsheet] could not load the sheet for the BCF thumbnail');
      done(null);
    };
    img.src = url;
  });
}

/** Comment id to the PNG thumbnail of its pin, for the comments whose sheet is on the page. */
export async function pinSnapshots(
  comments: readonly ReviewComment[],
  sheets: readonly ProjectSheet[],
  draw: (text: string, widthPx: number, heightPx: number) => Promise<string | null> = svgToPng,
  root: ParentNode = document,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const c of comments) {
    const sheet = sheets.find((s) => s.id === c.sheetId);
    const svg = sheet ? root.querySelector<SVGSVGElement>(`svg[data-sheet-id="${CSS.escape(sheet.id)}"]`) : null;
    if (!sheet || !svg) continue;
    const { text, crop } = pinCropSvg(svg, sheet, c);
    const png = await draw(text, Math.round(crop.w * PX_PER_MM), Math.round(crop.h * PX_PER_MM));
    if (png) out.set(c.id, png);
  }
  return out;
}
